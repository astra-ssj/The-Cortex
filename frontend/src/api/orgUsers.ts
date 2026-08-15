/** Organisation membership — invite + list. Admin-only on the server. */

import { fetchApi } from "./client";

export interface OrgUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string | null;
}

export interface OrgUserList {
  org_id: string;
  users: OrgUser[];
}

export interface OrgInvite {
  invite_id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  message: string;
}

export function listOrgUsers(): Promise<OrgUserList> {
  return fetchApi<OrgUserList>("/api/v1/auth/users");
}

export function inviteOrgUser(body: {
  email: string;
  role?: string;
  full_name?: string;
}): Promise<OrgInvite> {
  return fetchApi<OrgInvite>("/api/v1/auth/invite", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
