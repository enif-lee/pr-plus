/** Demo users API */
export type User = { id: string; name: string; role: 'admin' | 'member' };

export async function listUsers(): Promise<User[]> {
  // TODO: wire real endpoint
  return [
    { id: '1', name: 'Ada', role: 'admin' },
    { id: '2', name: 'Grace', role: 'member' },
  ];
}

export async function getUser(id: string): Promise<User | null> {
  const all = await listUsers();
  return all.find((u) => u.id === id) ?? null;
}

export function isAdmin(user: User): boolean {
  return user.role === 'admin';
}
