"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Role = { id: string; code: string; name: string };
type Permission = { id: string; code: string; name: string; module: string };

// Real gap: role_permissions (what a Role grants by default) had no UI path
// — only per-user overrides on /admin/users. This is the missing editor:
// one checkbox per (permission, role) pair, grouped by module to match the
// page's existing grouping, toggled through /api/admin/roles/[id]/permissions.
export function AdminRolePermissionsClient({ roles, groupedPermissions, initialGrants }: { roles: Role[]; groupedPermissions: [string, Permission[]][]; initialGrants: Record<string, boolean> }) {
  const router = useRouter();
  const [grants, setGrants] = useState(initialGrants);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggle(roleId: string, permissionId: string) {
    const key = `${roleId}:${permissionId}`;
    const next = !grants[key];
    setBusyKey(key);
    setError("");
    try {
      const res = await fetch(`/api/admin/roles/${roleId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission_id: permissionId, granted: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Không cập nhật được quyền.");
      setGrants((v) => ({ ...v, [key]: next }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>Gán quyền mặc định theo Role</h2>
          <p>Tick/bỏ để thay đổi quyền mặc định của cả một vai trò — khác với override riêng từng người dùng ở trang Người dùng.</p>
        </div>
      </div>
      {error ? <div className="alert error" style={{ margin: "0 18px 12px" }}>{error}</div> : null}
      {groupedPermissions.map(([module, permissions]) => (
        <div key={module} className="table-wrap" style={{ marginBottom: 6 }}>
          <table>
            <thead>
              <tr>
                <th>{module}</th>
                {roles.map((role) => (
                  <th key={role.id} style={{ textAlign: "center" }}>
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission) => (
                <tr key={permission.id}>
                  <td>
                    <strong>{permission.name}</strong>
                    <span className="subline">{permission.code}</span>
                  </td>
                  {roles.map((role) => {
                    const key = `${role.id}:${permission.id}`;
                    return (
                      <td key={role.id} style={{ textAlign: "center" }}>
                        <span className="inline-check" style={{ justifyContent: "center" }}>
                          <input
                            type="checkbox"
                            checked={!!grants[key]}
                            disabled={busyKey === key}
                            onChange={() => void toggle(role.id, permission.id)}
                          />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
