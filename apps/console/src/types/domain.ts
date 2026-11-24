/** Kiralama domain tipleri — docs/DOMAIN_MODEL.md ile hizalı stub */

export type MembershipRole = 'owner' | 'admin' | 'member';

export type InstanceStatus =
  | 'pending'
  | 'provisioning'
  | 'ready'
  | 'paused'
  | 'failed'
  | 'deleting'
  | 'deleted';

export type InstancePlan = 'starter' | 'pro' | 'scale' | 'max' | 'maxplus'

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export interface Membership {
  userId: string;
  tenantId: string;
  role: MembershipRole;
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  env: 'dev' | 'staging' | 'prod' | string;
  createdAt: string;
}

export interface Instance {
  id: string;
  projectId: string;
  name: string;
  plan: InstancePlan | string;
  region: string;
  status: InstanceStatus;
  host: string | null;
  port: number | null;
  database: string | null;
  connectionString: string | null;
  createdAt: string;
}
