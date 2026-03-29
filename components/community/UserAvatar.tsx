'use client';

interface UserAvatarProps {
  avatarUrl?: string | null;
  displayName?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export function UserAvatar({ avatarUrl, displayName, size = 'md', className = '' }: UserAvatarProps) {
  const dims = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  const initial = displayName?.[0]?.toUpperCase() || '?';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName || ''}
        className={`${dims} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div className={`${dims} rounded-full bg-htg-surface flex items-center justify-center text-htg-fg font-medium ${className}`}>
      {initial}
    </div>
  );
}
