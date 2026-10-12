import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  donorView,
  primaryNavigation,
  publicView,
  workspaceNavigation,
} from "../app/lib/navigation";
import { resolveWorkspace } from "../app/lib/hooks/use-viewer-role";

test("public navigation exposes campaigns and how it works only", () => {
  assert.deepEqual(
    primaryNavigation({
      isConnected: false,
      isAdmin: false,
      isOrganizationAuthority: false,
    }),
    [
      { href: "/campaigns", label: "Campaigns" },
      { href: "/how-it-works", label: "How it works" },
    ]
  );
});

test("primary navigation remains public while workspace navigation is role-scoped", () => {
  const organization = primaryNavigation({
    isConnected: true,
    isAdmin: false,
    isOrganizationAuthority: true,
  });
  assert.equal(
    organization.some((item) => item.href === "/org"),
    false
  );
  const admin = primaryNavigation({
    isConnected: true,
    isAdmin: true,
    isOrganizationAuthority: false,
  });
  assert.equal(
    admin.some((item) => item.href === "/admin/review"),
    false
  );
  assert.deepEqual(
    workspaceNavigation.organization.map((item) => item.href),
    ["/org", "/org/finance", "/org/verification", "/org/disasters"]
  );
  assert.deepEqual(
    workspaceNavigation.admin.map((item) => item.href),
    ["/admin/review", "/org", "/admin/disasters", "/admin/fraud"]
  );
});

test("donor and combined roles receive the correct non-duplicated tabs", () => {
  const donor = primaryNavigation({
    isConnected: true,
    isAdmin: false,
    isOrganizationAuthority: false,
  });
  assert.equal(
    donor.some((item) => item.href === "/dashboard"),
    false
  );

  const combined = primaryNavigation({
    isConnected: true,
    isAdmin: true,
    isOrganizationAuthority: true,
  });
  const hrefs = combined.map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(hrefs.includes("/org"), false);
  assert.equal(hrefs.includes("/admin/review"), false);
  assert.equal(hrefs.includes("/dashboard"), false);
  assert.deepEqual(workspaceNavigation.donor, [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/donations", label: "My donations" },
  ]);
  assert.equal(
    resolveWorkspace({
      isConnected: true,
      isAdmin: true,
      isOrganizationAuthority: true,
    }),
    "admin"
  );
});

test("public and donor view destinations are stable", () => {
  assert.equal(publicView.href, "/");
  assert.equal(donorView.href, "/dashboard");
});

test("workspace links are not overridden by a global role redirect", () => {
  const providers = readFileSync("app/components/providers.tsx", "utf8");
  assert.doesNotMatch(providers, /WalletRoleRedirect/);
  assert.doesNotMatch(
    readFileSync("app/lib/hooks/use-viewer-role.ts", "utf8"),
    /workspaceHome/
  );
});

test("navbar has a single scrollable row without a sheet menu", () => {
  const source = readFileSync("app/components/app-navbar.tsx", "utf8");
  assert.match(source, /overflow-x-auto/);
  assert.doesNotMatch(source, /Sheet|Menu/);
});

test("donor overview does not remain active on donation history", () => {
  const shell = readFileSync("app/components/workspace-shell.tsx", "utf8");
  assert.match(shell, /hrefPath !== "\/dashboard"/);
});
