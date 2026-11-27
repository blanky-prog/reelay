import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMe } from '@/lib/session';
import { getMyClipper, rateFor } from '@/lib/crew';
import { supabaseServer } from '@/lib/supabase/server';
import { captionCode, formatInr } from '@/lib/rules';
import { applyToCampaign, joinCampaign, submitClip } from '../../actions';
import { Chip, Flash } from '../../../ui';

export default async function CampaignDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const { ok, err } = await searchParams;
  const me = (await getMe())!;
  const clipper = await getMyClipper(me.id);
  const sb = await supabaseServer();
  const { data: c } = await sb.from('campaigns').select('*').eq('id', id).maybeSingle();
  if (!c || !clipper) notFound();

  const [{ data: briefs }, { data: files }, { data: member }, { data: app }, { data: accounts }] = await Promise.all([
    sb.from('briefs').select('instructions, banned_claims, music_rules, cta, version').eq('campaign_id', id).order('version', { ascending: false }).limit(1),
    sb.from('source_files').select('file_url, type').eq('campaign_id', id),
    sb.from('campaign_members').select('joined_at').eq('campaign_id', id).eq('clipper_id', clipper.id).maybeSingle(),
    sb.from('campaign_applications').select('status').eq('campaign_id', id).eq('clipper_id', clipper.id).maybeSingle(),
    sb.from('social_accounts').select('id, handle').not('verified_at', 'is', null),
  ]);
  const brief = briefs?.[0];
  const code = captionCode();
  const nowIst = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 16);

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <Link href="/crew/campaigns" className="muted">← All campaigns</Link>
      <div className="row"><h1>{c.name}</h1>{member ? <Chip tone="ok">Joined</Chip> : null}</div>
      <Flash ok={ok} err={err} />

      <div className="grid">
        <div className="card"><div className="muted">You earn</div><strong>{c.pay_model === 'per_post' ? `${formatInr(c.per_post_paise ?? 0)} per approved post` : `${formatInr(rateFor(c, clipper.tier))} per 1,000 verified views`}</strong></div>
        <div className="card"><div className="muted">Qualifies from</div><strong>10,000 views</strong></div>
        <div className="card"><div className="muted">Paid views capped at</div><strong>{Number(c.per_clip_cap_views).toLocaleString('en-IN')} per clip</strong></div>
      </div>

      <div className="card stack">
        <h2>Brief</h2>
        {brief ? (
          <>
            <p style={{ whiteSpace: 'pre-line' }}>{brief.instructions}</p>
            {brief.banned_claims?.length > 0 && <p><strong>Never say:</strong> {brief.banned_claims.join(', ')}</p>}
            {brief.music_rules && <p><strong>Music:</strong> {brief.music_rules}</p>}
            {brief.cta && <p><strong>Call to action:</strong> {brief.cta}</p>}
          </>
        ) : <p className="muted">The brief is being finalised.</p>}
        <p className="muted">Only views from India count. Clips lock on day 14 (70% paid) and are checked on day 30 (the other 30%). Deleting a clip or buying views means no payout and a ban.</p>
        {member && files && files.length > 0 && (
          <div>
            <strong>Footage and lead clips</strong>
            <ul>{files.map((f: any) => <li key={f.file_url}><a href={f.file_url} target="_blank" rel="noreferrer">{f.type === 'lead_clip' ? 'Lead clip' : 'Source footage'}</a></li>)}</ul>
          </div>
        )}
      </div>

      {!member && c.visibility === 'public' && (
        <form action={joinCampaign}><input type="hidden" name="campaign_id" value={id} /><button className="primary" type="submit">Join campaign</button></form>
      )}
      {!member && c.visibility === 'application' && !app && (
        <form action={applyToCampaign} className="card stack">
          <input type="hidden" name="campaign_id" value={id} />
          <label htmlFor="note">Why you're a good fit (optional)</label>
          <textarea id="note" name="note" maxLength={500} placeholder="Your niche, page size, past clips that did well" />
          <button className="primary" type="submit">Apply</button>
        </form>
      )}
      {!member && app && <p className="card">Application status: <strong>{app.status}</strong></p>}

      {member && c.status === 'live' && (
        <form action={submitClip} className="card stack">
          <h2>Submit a clip</h2>
          {!accounts?.length && <p className="flash flash-err">You need a verified Instagram account first. <Link href="/crew/accounts">Verify one</Link>.</p>}
          <div>
            <span className="muted">Put this code in your Reel's caption:</span>
            <div className="code">{code}</div>
            <input type="hidden" name="caption_code" value={code} />
            <input type="hidden" name="campaign_id" value={id} />
          </div>
          <div>
            <label htmlFor="reel_url">Reel link</label>
            <input id="reel_url" name="reel_url" required placeholder="https://www.instagram.com/reel/..." />
          </div>
          <div>
            <label htmlFor="caption">Paste the caption exactly as posted</label>
            <textarea id="caption" name="caption" required />
          </div>
          <div className="grid">
            <div>
              <label htmlFor="social_account_id">Posted from</label>
              <select id="social_account_id" name="social_account_id" required>
                {(accounts ?? []).map((a: any) => <option key={a.id} value={a.id}>@{a.handle}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="posted_at">Posted at (India time)</label>
              <input id="posted_at" name="posted_at" type="datetime-local" defaultValue={nowIst} required />
            </div>
            <div>
              <label htmlFor="baseline_views">Views right now</label>
              <input id="baseline_views" name="baseline_views" type="number" min={0} defaultValue={0} />
            </div>
          </div>
          <button className="primary" type="submit" disabled={!accounts?.length}>Submit clip</button>
        </form>
      )}
    </div>
  );
}
