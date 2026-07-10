import { staffPortalTarget } from "./staff-portals";

export function isAdminRole(roles: string[] = []) {
  return Array.isArray(roles) && roles.includes("realm-admin");
}

export function roleTarget(roles: string[] = []) {
  if (isAdminRole(roles)) return "/dashboard";
  return staffPortalTarget(roles);
}
