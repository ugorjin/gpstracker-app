import type { Device, Organization, Role, User } from '../repo/types.js';
import { ROLE_RANK } from '../repo/types.js';
import { forbidden, notFound, subscriptionExpired } from './errors.js';

/**
 * Who is making the request and what they can reach.
 *
 * Rules:
 *  - A user sees their own organisation and every organisation below it.
 *  - "Staff" = users of the platform or of a reseller. Staff manage the
 *    organisations below them, register devices and assign them to customers.
 *  - Within an organisation, roles decide actions:
 *      owner    everything, incl. managing owners
 *      admin    manage users (not owners), engine cut/restore, edit devices
 *      operator acknowledge alarms
 *      viewer   read only
 *  - Customers cannot see live data, history or send commands for devices
 *    whose subscription (`paid_until`) has passed. Staff still can.
 */
export class Principal {
  private readonly visible: Set<number>;

  constructor(
    readonly user: User,
    readonly org: Organization,
    visibleOrgIds: number[],
  ) {
    this.visible = new Set(visibleOrgIds);
  }

  get visibleOrgIds(): number[] {
    return [...this.visible];
  }

  get isStaff(): boolean {
    return this.org.type === 'platform' || this.org.type === 'reseller';
  }

  hasRole(min: Role): boolean {
    return ROLE_RANK[this.user.role] >= ROLE_RANK[min];
  }

  canSeeOrg(orgId: number): boolean {
    return this.visible.has(orgId);
  }

  /** Throws 404 (not 403) for organisations outside the user's tree, so ids can't be probed. */
  assertOrgVisible(orgId: number): void {
    if (!this.canSeeOrg(orgId)) throw notFound('Organization');
  }

  /** Create / edit organisations below the user's own. */
  assertCanManageChildOrgs(): void {
    if (!this.isStaff || !this.hasRole('admin')) throw forbidden('Only platform or reseller admins can manage customer accounts');
  }

  /** Edit an organisation's own details. */
  assertCanEditOrg(orgId: number): void {
    this.assertOrgVisible(orgId);
    if (!this.hasRole('admin')) throw forbidden();
    if (orgId !== this.org.id && !this.isStaff) throw forbidden();
  }

  /**
   * Manage users in an organisation, giving them `role`.
   * In their own organisation admins can't create or change owners, and nobody
   * can give a role above their own. Staff admins can give any role in
   * organisations below theirs (e.g. create a customer's first owner).
   */
  assertCanManageUsers(orgId: number, role?: Role): void {
    this.assertOrgVisible(orgId);
    if (!this.hasRole('admin')) throw forbidden('Only owners and admins can manage users');
    if (orgId === this.org.id) {
      if (role && ROLE_RANK[role] > ROLE_RANK[this.user.role]) throw forbidden(`You cannot give the ${role} role`);
    } else if (!this.isStaff) {
      throw forbidden();
    }
  }

  assertDeviceVisible(device: Device | undefined): asserts device is Device {
    if (!device || !this.canSeeOrg(device.orgId)) throw notFound('Device');
  }

  /** Register devices, assign them to customers, change subscription dates. */
  assertCanManageDeviceInventory(): void {
    if (!this.isStaff || !this.hasRole('admin')) throw forbidden('Only platform or reseller admins can register devices');
  }

  /** Rename a device, set its plate number and kind. */
  assertCanEditDevice(device: Device): void {
    if (!this.hasRole('admin')) throw forbidden();
    void device;
  }

  isSubscriptionActive(device: Device, now = new Date()): boolean {
    return device.paidUntil === null || device.paidUntil > now;
  }

  /** Live data, history and commands need an active subscription, except for staff. */
  assertTrackingAllowed(device: Device): void {
    if (!this.isStaff && !this.isSubscriptionActive(device)) throw subscriptionExpired();
  }

  assertCanCommand(device: Device): void {
    if (!this.hasRole('admin')) throw forbidden('Only owners and admins can send commands to a vehicle');
    if (!device.active) throw forbidden('This device is deactivated');
    this.assertTrackingAllowed(device);
  }

  assertCanAcknowledgeAlarms(): void {
    if (!this.hasRole('operator')) throw forbidden('Viewers cannot acknowledge alarms');
  }
}
