export type NavigationRoles = {
  isConnected: boolean;
  isAdmin: boolean;
  isOrganizationAuthority: boolean;
};

export type NavigationItem = { href: string; label: string };

export type WorkspaceNavigation = "donor" | "organization" | "admin";

export const workspaceNavigation: Record<
  WorkspaceNavigation,
  NavigationItem[]
> = {
  donor: [{ href: "/dashboard", label: "My donations" }],
  organization: [
    { href: "/org", label: "Organization profile" },
    { href: "/org/finance", label: "Finance & verification" },
    { href: "/org/disasters", label: "Disaster opportunities" },
  ],
  admin: [
    { href: "/admin/review", label: "Operations" },
    { href: "/org", label: "Organizations" },
    { href: "/admin/disasters", label: "Disasters" },
    { href: "/admin/fraud", label: "Fraud review" },
  ],
};

export function primaryNavigation(roles: NavigationRoles): NavigationItem[] {
  // Keep the role-shaped call site while role-specific destinations live in the workspace sidebar.
  void roles;
  return [
    { href: "/campaigns", label: "Campaigns" },
    { href: "/how-it-works", label: "How it works" },
  ];
}

export const publicView: NavigationItem = {
  href: "/",
  label: "Public view",
};
export const donorView: NavigationItem = {
  href: "/dashboard",
  label: "Donor view",
};
