import { WorkspaceShell } from "../components/view-shell";

export default function OrganizationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
