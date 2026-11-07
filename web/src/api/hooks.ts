import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './client';
import type {
  Alarm,
  CommandLog,
  CommandRequest,
  CommandResult,
  CustomerKind,
  Device,
  DeviceKind,
  HistoryResponse,
  Org,
  OrgType,
  Role,
  User,
} from './types';

export const keys = {
  me: ['me'] as const,
  live: ['live'] as const,
  devices: (orgId?: number) => ['devices', orgId ?? 'all'] as const,
  device: (id: string) => ['device', id] as const,
  history: (id: string, from: string, to: string) => ['history', id, from, to] as const,
  commands: (id: string) => ['commands', id] as const,
  alarms: (filter: object) => ['alarms', filter] as const,
  orgs: (type?: OrgType) => ['orgs', type ?? 'all'] as const,
  users: (orgId: number) => ['users', orgId] as const,
  unregistered: ['unregistered'] as const,
};

// ------------------------------------------------------------------ devices

export function useLive() {
  return useQuery({
    queryKey: keys.live,
    queryFn: () => api<{ serverTime: string; devices: Device[] }>('GET', '/live'),
    // The live stream keeps this fresh; a slow refetch catches anything missed.
    refetchInterval: 60_000,
  });
}

export function useDevices(orgId?: number) {
  return useQuery({
    queryKey: keys.devices(orgId),
    queryFn: () => api<{ devices: Device[] }>('GET', '/devices', { query: { orgId, includeInactive: true } }).then((r) => r.devices),
  });
}

export function useHistory(deviceId: string, from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.history(deviceId, from, to),
    queryFn: () => api<HistoryResponse>('GET', `/devices/${encodeURIComponent(deviceId)}/history`, { query: { from, to } }),
    enabled,
    staleTime: 30_000,
  });
}

export function useCommandLog(deviceId: string | undefined) {
  return useQuery({
    queryKey: keys.commands(deviceId ?? ''),
    queryFn: () => api<{ commands: CommandLog[] }>('GET', `/devices/${encodeURIComponent(deviceId!)}/commands`).then((r) => r.commands),
    enabled: !!deviceId,
  });
}

export function useSendCommand(deviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CommandRequest): Promise<CommandResult> => {
      try {
        return await api<CommandResult>('POST', `/devices/${encodeURIComponent(deviceId)}/commands`, { body });
      } catch (err) {
        // 409 = the vendor answered but did not accept (e.g. device offline): a result, not a failure.
        if (err instanceof ApiError && err.status === 409 && err.body && typeof err.body === 'object' && 'accepted' in err.body) {
          return err.body as CommandResult;
        }
        throw err;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.commands(deviceId) }),
  });
}

export interface DeviceInput {
  deviceId: string;
  orgId: number;
  name: string;
  kind: DeviceKind;
  plateNumber: string | null;
  vendorDeviceType: number;
  simNumber: string | null;
  notes: string | null;
  paidUntil: string | null;
  registerWithVendor: boolean;
}

export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceInput) => api<{ device: Device }>('POST', '/devices', { body }).then((r) => r.device),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      qc.invalidateQueries({ queryKey: keys.live });
      qc.invalidateQueries({ queryKey: keys.unregistered });
    },
  });
}

export function useUpdateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Omit<DeviceInput, 'deviceId' | 'registerWithVendor'>> & { active?: boolean }) =>
      api<{ device: Device }>('PATCH', `/devices/${encodeURIComponent(id)}`, { body }).then((r) => r.device),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      qc.invalidateQueries({ queryKey: keys.live });
    },
  });
}

export function useUnregistered(enabled: boolean) {
  return useQuery({
    queryKey: keys.unregistered,
    queryFn: () =>
      api<{ devices: { deviceId: string; deviceName: string | null; lastSeenAt: string }[] }>('GET', '/devices/unregistered').then(
        (r) => r.devices,
      ),
    enabled,
  });
}

// ------------------------------------------------------------------- alarms

export interface AlarmFilter {
  status: 'open' | 'acknowledged' | 'all';
  deviceId?: string;
}

export function useAlarms(filter: AlarmFilter) {
  return useQuery({
    queryKey: keys.alarms(filter),
    queryFn: () => api<{ alarms: Alarm[]; nextBeforeId: number | null }>('GET', '/alarms', { query: { ...filter, limit: 200 } }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useAcknowledgeAlarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => api<{ alarm: Alarm }>('POST', `/alarms/${id}/acknowledge`, { body: { note } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['alarms'] }),
  });
}

// --------------------------------------------------------------- orgs/users

export function useOrgs(type?: OrgType) {
  return useQuery({
    queryKey: keys.orgs(type),
    queryFn: () => api<{ orgs: Org[] }>('GET', '/orgs', { query: { type } }).then((r) => r.orgs),
  });
}

export interface NewCustomer {
  type: 'customer' | 'reseller';
  customerKind?: CustomerKind;
  parentId?: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  countryCode?: string;
  utcOffsetMinutes?: number;
  owner?: { name: string; email?: string | null; phone?: string | null; password: string };
}

export function useCreateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewCustomer) => api<{ org: Org; owner?: User }>('POST', '/orgs', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
  });
}

export function useUpdateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Pick<Org, 'name' | 'phone' | 'email' | 'active' | 'countryCode' | 'utcOffsetMinutes'>>) =>
      api<{ org: Org }>('PATCH', `/orgs/${id}`, { body }).then((r) => r.org),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orgs'] });
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useUsers(orgId: number | undefined) {
  return useQuery({
    queryKey: keys.users(orgId ?? 0),
    queryFn: () => api<{ users: User[] }>('GET', `/orgs/${orgId}/users`).then((r) => r.users),
    enabled: !!orgId,
  });
}

export function useCreateUser(orgId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; email?: string | null; phone?: string | null; password: string; role: Role }) =>
      api<{ user: User }>('POST', `/orgs/${orgId}/users`, { body }).then((r) => r.user),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users(orgId) }),
  });
}

export function useUpdateUser(orgId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; email?: string | null; phone?: string | null; role?: Role; active?: boolean; password?: string }) =>
      api<{ user: User }>('PATCH', `/users/${id}`, { body }).then((r) => r.user),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users(orgId) }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => api<void>('POST', '/me/password', { body }),
  });
}
