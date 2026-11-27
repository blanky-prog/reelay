export type Role =
  | 'super_admin' | 'campaign_manager' | 'qa_reviewer' | 'network_manager' | 'finance'
  | 'client_admin' | 'client_viewer' | 'clipper';

export type Portal = 'crew' | 'room' | 'live';

export const TEAM_ROLES: Role[] = ['super_admin', 'campaign_manager', 'qa_reviewer', 'network_manager', 'finance'];
export const CLIENT_ROLES: Role[] = ['client_admin', 'client_viewer'];

export function portalFor(role: Role): Portal {
  if (role === 'clipper') return 'crew';
  if (CLIENT_ROLES.includes(role)) return 'live';
  return 'room';
}

export const portalPath = (p: Portal) => `/${p}`;

export function canUsePortal(role: Role, portal: Portal): boolean {
  return portalFor(role) === portal;
}

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super admin',
  campaign_manager: 'Campaign manager',
  qa_reviewer: 'QA reviewer',
  network_manager: 'Network manager',
  finance: 'Finance',
  client_admin: 'Client admin',
  client_viewer: 'Client viewer',
  clipper: 'Clipper',
};
