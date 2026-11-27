import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { CLIP_STATUS } from '@/lib/crew';
import { addPromoCode, addSourceFile, decideApplication, inviteClipper, saveBrief, updateCampaign } from '../../actions';
import { CampaignFields } from '../CampaignForm';
import { Chip, Flash } from '../../../ui';

export default async function CampaignDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const { ok, err } = await searchParams;
  const sb = await supabaseServer();
  const { data: c } = await sb.from('campaigns').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  const [{ data: orgs }, { data: briefs }, { data: files }, { data: apps }, { data: members }, { data: codes }, { data: clips }, { data: left }] = await Promise.all([
    sb.from('organisations').select('id, name').eq('type', 'client').order('name'),
    sb.from('briefs').select('*').eq('campaign_id', id).order('version', { ascending: false }).limit(1),
    sb.from('source_files').select('id, file_url, type').eq('campaign_id', id),
    sb.from('campaign_applications').select('clipper_id, note, status, clippers(tier, users(name))').eq('campaign_id', id).eq('status', 'pending'),
    sb.from('campaign_members').select('clipper_id, joined_at, clippers(tier, users(name))').eq('campaign_id', id),
    sb.from('promo_codes').select('code').eq('campaign_id', id),
    sb.from('clips').select('status').eq('campaign_id', id),
    sb.rpc('campaign_views_left', { p_campaign: id }),
  ]);
  const brief = briefs?.[0];
  const counts: Record<string, number> = {};
  for (const x of clips ?? []) counts[x.status] = (counts[x.status] ?? 0) + 1;
  const paidSoFar = left == null ? 0 : c.view_target - (left as number);

  return (
    <div className="stack" style={{ maxWidth: 960 }}>
      <Link href="/room/campaigns" className="muted">← Campaigns</Link>
      <div className="row"><h1>{c.name}</h1><Chip tone={c.status === 'live' ? 'ok' : c.status === 'draft' ? 'warn' : ''}>{c.status}</Chip></div>
      <Flash ok={ok} err={err} />

      <div className="grid">
        <div className="card"><div className="muted">Paid views so far</div><div className="stat" style={{ color: 'var(--verified)' }}>{paidSoFar.toLocaleString('en-IN')}</div><div className="muted">of {Number(c.view_target).toLocaleString('en-IN')}</div></div>
        <div className="card"><div className="muted">Clippers in</div><div className="stat">{members?.length ?? 0}</div></div>
        <div className="card"><div className="muted">Clips</div><div className="stat">{clips?.length ?? 0}</div><div className="muted">{Object.entries(counts).map(([s, n]) => `${n} ${CLIP_STATUS[s]?.label.toLowerCase() ?? s}`).join(' · ')}</div></div>
      </div>

      <form action={updateCampaign} className="card stack">
        <h2>Setup</h2>
        <input type="hidden" name="id" value={id} />
        <CampaignFields c={c} orgs={(orgs ?? []) as any} />
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <label style={{ margin: 0 }}>Status
            <select name="status" defaultValue={c.status} style={{ width: 200 }}>
              <option value="draft">Draft (hidden from clippers)</option><option value="live">Live</option><option value="full">Full</option><option value="closed">Closed</option>
            </select>
          </label>
          <button className="primary" type="submit">Save setup</button>
        </div>
        {c.status === 'draft' && !brief && <p className="muted">Add a brief below before setting the campaign live.</p>}
      </form>

      <form action={saveBrief} className="card stack">
        <h2>Brief {brief ? `(version ${brief.version})` : ''}</h2>
        <input type="hidden" name="campaign_id" value={id} />
        <div><label htmlFor="instructions">Instructions for clippers</label><textarea id="instructions" name="instructions" required defaultValue={brief?.instructions ?? ''} rows={6} placeholder="What the clips should do, hooks to try, who the audience is, what to avoid" /></div>
        <div className="grid">
          <div><label htmlFor="banned_claims">Never say (comma separated)</label><input id="banned_claims" name="banned_claims" defaultValue={(brief?.banned_claims ?? []).join(', ')} /></div>
          <div><label htmlFor="music_rules">Music rules</label><input id="music_rules" name="music_rules" defaultValue={brief?.music_rules ?? 'Original audio or royalty-free only'} /></div>
          <div><label htmlFor="cta">Call to action</label><input id="cta" name="cta" defaultValue={brief?.cta ?? ''} /></div>
        </div>
        <button className="primary" type="submit">{brief ? 'Save as new version' : 'Save brief'}</button>
      </form>

      <div className="grid">
        <div className="card stack">
          <h2>Footage and lead clips</h2>
          <ul>{(files ?? []).map((f: any) => <li key={f.id}><a href={f.file_url} target="_blank" rel="noreferrer">{f.type === 'lead_clip' ? 'Lead clip' : 'Source footage'}</a></li>)}</ul>
          <form action={addSourceFile} className="stack">
            <input type="hidden" name="campaign_id" value={id} />
            <input name="file_url" placeholder="Google Drive or Dropbox link" required aria-label="File link" />
            <select name="type" aria-label="File type"><option value="raw">Source footage</option><option value="lead_clip">Lead clip</option></select>
            <button type="submit">Add file</button>
          </form>
        </div>
        <div className="card stack">
          <h2>Promo codes</h2>
          <p>{(codes ?? []).map((x: any) => x.code).join(', ') || <span className="muted">None yet</span>}</p>
          <form action={addPromoCode} className="row">
            <input type="hidden" name="campaign_id" value={id} />
            <input name="code" placeholder="PODCAST15" required aria-label="Promo code" style={{ flex: 1 }} />
            <button type="submit">Add</button>
          </form>
        </div>
      </div>

      {c.visibility === 'application' && (
        <div className="card stack">
          <h2>Applications</h2>
          {!apps?.length ? <p className="muted">No pending applications.</p> : apps.map((a: any) => (
            <form key={a.clipper_id} action={decideApplication} className="row">
              <input type="hidden" name="campaign_id" value={id} /><input type="hidden" name="clipper_id" value={a.clipper_id} />
              <span><Link href={`/room/clippers/${a.clipper_id}`}><strong>{a.clippers?.users?.name}</strong></Link> · {a.clippers?.tier}{a.note ? <span className="muted"> · {a.note}</span> : null}</span>
              <span className="row"><button className="primary" name="decision" value="approve" type="submit">Approve</button><button name="decision" value="decline" type="submit">Decline</button></span>
            </form>
          ))}
        </div>
      )}

      <div className="card stack">
        <h2>Clippers in this campaign</h2>
        <form action={inviteClipper} className="row" style={{ justifyContent: 'flex-start' }}>
          <input type="hidden" name="campaign_id" value={id} />
          <input name="handle" placeholder="@instagramhandle" required aria-label="Clipper Instagram handle" style={{ maxWidth: 260 }} />
          <button type="submit">Add clipper</button>
        </form>
        <p>{(members ?? []).map((m: any) => `${m.clippers?.users?.name} (${m.clippers?.tier})`).join(', ') || <span className="muted">Nobody yet.</span>}</p>
      </div>
    </div>
  );
}
