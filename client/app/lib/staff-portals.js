export const STAFF_ROLE_ORDER = [
  "owner",
  "service-manager",
  "senior-technician",
  "technician",
  "helper-apprentice",
];

export const STAFF_PORTALS = {
  owner: {
    path: "/portal/owner",
    title: "Owner Dashboard",
    label: "Owner",
    intro: "Realm admin and full owner control across the whole service center.",
    stats: [
      ["Realm access", "Full"],
      ["Shop control", "All areas"],
      ["Staff scope", "All users"],
      ["Permission level", "Highest"],
    ],
    cards: [
      ["Full realm control", "Can manage users, roles, groups, clients, sessions, and realm settings."],
      ["Business oversight", "Can review service managers, senior technicians, technicians, and apprentices."],
      ["Shop authority", "Final authority for staffing, access, and operational decisions."],
    ],
    actions: ["Open IAM admin dashboard", "Review all staff levels", "Audit realm access"],
  },
  "service-manager": {
    path: "/portal/service-manager",
    title: "Workshop Manager Dashboard",
    label: "Workshop / Service Manager",
    intro: "One level below owner, responsible for workshop control and staff coordination.",
    stats: [
      ["Can view", "Staff below"],
      ["Can create", "Technicians"],
      ["Can manage", "Shop work"],
      ["Reports to", "Owner"],
    ],
    cards: [
      ["Senior technician view", "Can view senior technicians and their assigned teams."],
      ["Technician creation", "Can create new technician accounts through the controlled workflow."],
      ["Workshop control", "Can coordinate job flow, staffing, delivery status, and escalations."],
    ],
    actions: ["View senior technicians", "Create technician", "Review workshop status"],
  },
  "senior-technician": {
    path: "/portal/senior-technician",
    title: "Senior Technician Dashboard",
    label: "Senior Technician",
    intro: "Looks over technicians and apprentices, with responsibility for technical quality.",
    stats: [
      ["Can view", "Technicians"],
      ["Can guide", "Apprentices"],
      ["Can review", "Work quality"],
      ["Reports to", "Manager"],
    ],
    cards: [
      ["Technician supervision", "Can view technicians and follow their active service work."],
      ["Apprentice oversight", "Can monitor apprentices and guide their learning tasks."],
      ["Quality review", "Can review diagnostics, repair notes, and completed work before closure."],
    ],
    actions: ["View technicians", "View apprentices", "Review completed work"],
  },
  technician: {
    path: "/portal/technician",
    title: "Technician Dashboard",
    label: "Technician / Mechanic",
    intro: "Does the workshop repair work and only needs access to assigned work.",
    stats: [
      ["Can view", "Own work"],
      ["Can update", "Job status"],
      ["Can request", "Review"],
      ["Reports to", "Senior tech"],
    ],
    cards: [
      ["Assigned work", "Can see only assigned repair/service work."],
      ["Work updates", "Can update progress, repair notes, parts usage, and status."],
      ["Review handoff", "Can send completed work to the senior technician for review."],
    ],
    actions: ["View assigned work", "Update work status", "Request senior review"],
  },
  "helper-apprentice": {
    path: "/portal/helper-apprentice",
    title: "Apprentice Dashboard",
    label: "Helper / Apprentice",
    intro: "Learning-focused role with view-only/supervised access.",
    stats: [
      ["Can view", "Learning tasks"],
      ["Can edit", "Limited"],
      ["Can learn", "Guided work"],
      ["Reports to", "Technician"],
    ],
    cards: [
      ["Learning view", "Can view assigned learning and helper tasks."],
      ["Supervised work", "Can follow instructions under technician supervision."],
      ["Limited access", "Cannot create users, manage staff, or change workshop control data."],
    ],
    actions: ["View learning tasks", "Read instructions", "Request guidance"],
  },
};

export function highestStaffRole(roles = []) {
  return STAFF_ROLE_ORDER.find((role) => roles.includes(role)) || null;
}

export function staffPortalTarget(roles = []) {
  const role = highestStaffRole(roles);
  return role ? STAFF_PORTALS[role].path : "/user-portal";
}

export function canAccessStaffPortal(roles = [], portalRole) {
  if (roles.includes("realm-admin") || roles.includes("owner")) return true;
  const userRole = highestStaffRole(roles);
  if (!userRole) return false;
  return (
    STAFF_ROLE_ORDER.indexOf(userRole) <= STAFF_ROLE_ORDER.indexOf(portalRole)
  );
}
