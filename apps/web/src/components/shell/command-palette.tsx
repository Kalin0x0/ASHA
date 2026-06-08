'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { CornerDownLeft, MonitorPlay, Moon, Play, Search, Star, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { orderByFavorites, useFavorites } from '@/lib/favorites-store';
import { useLaunchSession, useWorkspaces } from '@/lib/hooks';
import { navGroups } from '@/lib/nav';
import { useUIStore } from '@/lib/ui-store';

export function CommandPalette() {
  const router = useRouter();
  const { commandOpen, setCommandOpen } = useUIStore();
  const { setTheme, resolvedTheme } = useTheme();
  const workspaces = useWorkspaces();
  const favorites = useFavorites();
  const launch = useLaunchSession();

  const favWorkspaces = useMemo(
    () => orderByFavorites(workspaces.filter((w) => w.enabled), favorites.ids),
    [workspaces, favorites.ids],
  );

  const launchWorkspace = async (id: string) => {
    const session = await launch(id);
    if (!session) {
      toast.error('Could not start the session');
      return;
    }
    router.push(`/session/${session.id}`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [commandOpen, setCommandOpen]);

  const run = (fn: () => void) => {
    setCommandOpen(false);
    fn();
  };

  return (
    <DialogPrimitive.Root open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-anthracite-950/70 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="gold-hairline glass-strong fixed left-1/2 top-[14%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border-subtle shadow-[var(--shadow-lifted),0_0_0_1px_rgba(212,175,55,0.07)] data-[state=open]:animate-rise">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
            <div className="flex items-center gap-3 border-b border-border-subtle px-4">
              <Search className="size-[18px] text-gold-300" />
              <Command.Input
                autoFocus
                placeholder="Search pages and actions…"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded border border-border-subtle bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                ESC
              </kbd>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                No results found.
              </Command.Empty>

              {favWorkspaces.length > 0 && (
                <Command.Group heading="Favorites">
                  {favWorkspaces.map((ws) => (
                    <Item
                      key={ws.id}
                      onSelect={() => run(() => void launchWorkspace(ws.id))}
                      icon={<Star className="size-4 fill-gold-400 text-gold-300" />}
                    >
                      Launch {ws.friendlyName}
                    </Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Quick actions">
                <Item onSelect={() => run(() => router.push('/'))} icon={<Play className="size-4" />}>
                  Launch a workspace
                </Item>
                <Item onSelect={() => run(() => router.push('/sessions'))} icon={<MonitorPlay className="size-4" />}>
                  View live sessions
                </Item>
                <Item
                  onSelect={() => run(() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light'))}
                  icon={resolvedTheme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
                >
                  Toggle theme
                </Item>
              </Command.Group>

              {navGroups.map((group) => (
                <Command.Group key={group.label} heading={group.label}>
                  {group.items.map((item) => (
                    <Item
                      key={item.href}
                      onSelect={() => run(() => router.push(item.href))}
                      icon={<item.icon className="size-4" />}
                    >
                      {item.label}
                    </Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
            <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft className="size-3" /> to select
              </span>
              <span>Chista Command</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Item({
  children,
  onSelect,
  icon,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="group/item flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted-foreground outline-none transition-all duration-150 data-[selected=true]:bg-gold-500/[0.1] data-[selected=true]:text-foreground"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground ring-1 ring-border-subtle transition-colors group-data-[selected=true]/item:bg-gold-500/15 group-data-[selected=true]/item:text-gold-300 group-data-[selected=true]/item:ring-gold-500/30 [&_svg]:size-4">
        {icon}
      </span>
      <span className="flex-1 truncate">{children}</span>
      <CornerDownLeft className="size-3.5 text-gold-300 opacity-0 transition-opacity group-data-[selected=true]/item:opacity-100" />
    </Command.Item>
  );
}
