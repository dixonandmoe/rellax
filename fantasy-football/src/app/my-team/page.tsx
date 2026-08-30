import { redirect } from 'next/navigation';
import { loadLeagueState } from '@/services/league-state';

export const dynamic = 'force-dynamic';

/** "My Team" is the team detail page for whichever team is flagged as mine. */
export default async function MyTeamPage() {
  const loaded = await loadLeagueState();
  const myTeam = loaded.state.teams.find((t) => t.isMyTeam) ?? loaded.state.teams[0];
  if (!myTeam) redirect('/espn');
  redirect(`/league/${encodeURIComponent(myTeam.id)}`);
}
