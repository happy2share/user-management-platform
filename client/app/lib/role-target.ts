export function isAdminRole(roles: string[] = []) {
  return Array.isArray(roles) && roles.includes("realm-admin");
}

export function roleTarget(roles: string[] = []) {
  return isAdminRole(roles) ? "/dashboard" : "/user-portal";
}
