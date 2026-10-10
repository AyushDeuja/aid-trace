export type NavigationRoles = {
  isConnected: boolean;
  isAdmin: boolean;
  isOrganizationAuthority: boolean;
};

export type NavigationItem = { href: string; label: string };

export function primaryNavigation({
  isConnected,
  isAdmin,
  isOrganizationAuthority,
}: NavigationRoles): NavigationItem[] {
  return [
    { href: "/campaigns", label: "Campaigns" },
    { href: "/how-it-works", label: "How it works" },
    ...(isConnected && !isOrganizationAuthority && !isAdmin
      ? [{ href: "/dashboard", label: "My donations" }]
      : []),
    ...(isOrganizationAuthority
      ? [
          { href: "/org", label: "Organizations" },
          { href: "/org/finance", label: "Finance" },
        ]
      : []),
    ...(isAdmin
      ? [
          { href: "/admin/disasters", label: "Disasters" },
          { href: "/admin/fraud", label: "Fraud review" },
          { href: "/admin/review", label: "Admin review" },
        ]
      : []),
  ];
}

export const publicView: NavigationItem = {
  href: "/campaigns",
  label: "Public view",
};
export const donorView: NavigationItem = {
  href: "/dashboard",
  label: "Donor view",
};
