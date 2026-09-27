import { WorkspaceShell } from "../components/view-shell";

export default function DonorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
