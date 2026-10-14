import { redirect } from "next/navigation";

// Legacy Brain Map links now open the personal notebook.
export default function LegacyBrainMapRedirect() {
  redirect("/me#knowledge-journal");
}
