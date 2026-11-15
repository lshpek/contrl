import { useState } from 'react';

export type AvatarKind = 'brand' | 'owner' | 'staff' | 'client';

const AVATAR_SRC: Record<AvatarKind, string> = {
  brand: '/assets/botvex_avatar.jpg',
  owner: '/assets/avatar_owner.jpg',
  staff: '/assets/avatar_staff.jpg',
  client: '/assets/avatar_client.jpg',
};

export function resolveRoleKind(roles: string[], isOwner?: boolean): AvatarKind {
  if (isOwner || roles.includes('owner')) return 'owner';
  if (roles.includes('client')) return 'client';
  return 'staff';
}

export function RoleAvatar({
  kind,
  label,
  size = 36,
  className = '',
}: {
  kind: AvatarKind;
  label: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = label.trim().slice(0, 2).toUpperCase() || 'BV';

  if (failed) {
    return (
      <span
        className={`role-avatar role-avatar-${kind} ${className}`.trim()}
        style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
        aria-hidden="true"
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={AVATAR_SRC[kind]}
      alt={label}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`role-avatar role-avatar-img role-avatar-${kind} ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  );
}
