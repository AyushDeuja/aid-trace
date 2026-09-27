import { WorkspaceShell } from "../components/view-shell";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
