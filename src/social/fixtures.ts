/** Synthetic people and messages only. Nothing here represents a live account. */
export interface SocialPerson { id: string; name: string; bio: string }
export interface SocialPost { id: string; authorId: string; topic: string; text: string; replies: number }
export interface SocialMessage { id: string; personId: string; direction: 'incoming' | 'outgoing'; text: string; status: 'Demo received' | 'Demo sent' }

export const SOCIAL_LIMITS = Object.freeze({ people: 8, posts: 16, messages: 48, text: 1200, name: 48 });

export const SOCIAL_DEMO_DATA = {
  people: [
    { id: 'mira', name: 'Mira', bio: 'Small walks. Big ideas. Usually outside.' },
    { id: 'jun', name: 'Jun', bio: 'Building things and finding good coffee.' },
    { id: 'asha', name: 'Asha', bio: 'Looking for a slower way to stay connected.' },
  ] satisfies SocialPerson[],
  posts: [
    { id: 'post-mira', authorId: 'mira', topic: 'Small discoveries', text: 'Took the long way home. Found a tiny bookshop I have walked past a hundred times. What did you notice today?', replies: 8 },
    { id: 'post-jun', authorId: 'jun', topic: 'Made for glasses', text: 'One thought at a time feels right on glasses. No infinite feed. Just something worth looking up for.', replies: 5 },
    { id: 'post-asha', authorId: 'asha', topic: 'Weekend plans', text: 'A quiet park, a thermos, and no agenda. Anyone else making room for a little less this weekend?', replies: 3 },
  ] satisfies SocialPost[],
  messages: [
    { id: 'msg-mira', personId: 'mira', direction: 'incoming', text: 'That little bookshop is still open. Shall we meet there tomorrow?', status: 'Demo received' },
    { id: 'msg-jun', personId: 'jun', direction: 'incoming', text: 'I have a new glasses prototype to show you. Free for a quick chat?', status: 'Demo received' },
  ] satisfies SocialMessage[],
};

export function socialFixture(kind: 'default' | 'stress' | 'empty') {
  if (kind === 'empty') return { people: [] as SocialPerson[], posts: [] as SocialPost[], messages: [] as SocialMessage[] };
  const data = {
    people: SOCIAL_DEMO_DATA.people.map(person => ({ ...person })),
    posts: SOCIAL_DEMO_DATA.posts.map(post => ({ ...post })),
    messages: SOCIAL_DEMO_DATA.messages.map(message => ({ ...message })),
  };
  if (kind === 'stress') {
    data.people[0]!.name = 'W'.repeat(SOCIAL_LIMITS.name);
    data.people[0]!.bio = '漢字と長い文章 '.repeat(100).slice(0, SOCIAL_LIMITS.text);
    data.posts[0]!.text = 'W'.repeat(SOCIAL_LIMITS.text);
    data.posts[1]!.text = '漢字'.repeat(SOCIAL_LIMITS.text / 2);
    data.posts[2]!.text = 'A deliberately long message with many ordinary words. '.repeat(30).slice(0, SOCIAL_LIMITS.text);
    data.messages[0]!.text = '漢字'.repeat(SOCIAL_LIMITS.text / 2);
    data.messages[1]!.text = 'W'.repeat(SOCIAL_LIMITS.text);
  }
  return data;
}
