export type UserContext = {
  id: string;
  email: string | null;
  fullName: string | null;
  jobTitle: string | null;
  primaryDepartmentId: string | null;
  primaryDepartmentName: string | null;
  roleCodes: string[];
  permissions: string[];
  scopeTypes: string[];
  organizationId: string | null;
};

export type OrganizationInfo = {
  id: string;
  name: string;
  short_name: string | null;
  code: string | null;
  logo_path: string | null;
  address: string | null;
  website: string | null;
  timezone: string;
  primary_color: string | null;
  secondary_color: string | null;
};

export type NavItem = {
  label: string;
  href: string;
  icon: string;
  permission?: string;
  anyPermissions?: string[];
  workspaceRoot?: string;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};