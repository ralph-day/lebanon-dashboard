// Analysis feature — indicator registry for the survey results explorer.
//
// This describes WHICH substantive survey questions the Analysis tab charts and
// HOW to interpret their stored values. The /api/analysis endpoint uses it to
// project the accepted-survey rows into a compact, PII-free dataset the client
// cross-tabs in the browser.
//
// Storage conventions observed in the `data` sheet:
//   - single-choice categorical  → readable text (e.g. "paid_rental") or a code
//   - likert                     → integer 1..5, with 98 = "don't know",
//                                  99 = "prefer not to answer"
//   - multi-select               → one 0/1 column per option, named
//                                  `${key}_${suffix}` (+ `_text`, `_98`, `_99`)
//   - binary yes/no              → 0/1
// 98/99/blank are always treated as non-response and excluded from denominators
// (reported separately by the client).

const prettify = s =>
  String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();

// ── Disaggregation dimensions ────────────────────────────────────────────────
// Each respondent is tagged with these so any chart can be broken down by them.
const NONRESPONSE = new Set(['98', '99', '', null, undefined]);

function normDisplacement(v) {
  const s = String(v ?? '').toLowerCase();
  if (s === '0' || s === 'no') return 'Not displaced';
  if (s === 'before' || s === 'after' || s === '1' || s === 'yes') return 'Displaced';
  return null; // 99 / blank
}
function ageBucket(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 25) return '18–24';
  if (n < 35) return '25–34';
  if (n < 45) return '35–44';
  if (n < 55) return '45–54';
  if (n < 65) return '55–64';
  return '65+';
}

const DIMENSIONS = [
  { key: 'nationality', label: 'Nationality', from: r => prettify(r.nationality) || null },
  { key: 'gender',      label: 'Gender',      from: r => prettify(r.gender) || null },
  { key: 'displacement',label: 'Displacement',from: r => normDisplacement(r.displaced) },
  { key: 'governorate', label: 'Governorate', from: r => prettify(r.loc_2) || null },
  { key: 'district',    label: 'District',    from: r => prettify(r.loc_3) || null },
  { key: 'ageGroup',    label: 'Age group',   from: r => ageBucket(r.age) },
];

// ── Single-choice categorical indicators ─────────────────────────────────────
// `order` (optional) fixes the bar order for ordinal answers; otherwise sorted
// by frequency. valueLabels overrides the auto-prettified label per raw value.
const SINGLE = [
  { key: 'nationality', label: 'Nationality', section: 'Demographics' },
  { key: 'gender', label: 'Gender', section: 'Demographics' },
  { key: 'living_situation', label: 'Living situation', section: 'Demographics' },
  { key: 'registration', label: 'Aid registration status', section: 'Demographics',
    valueLabels: { mosa_and_un: 'MoSA & UN', un_ngo_only: 'UN/NGO only', mosa_only: 'MoSA only', none: 'Not registered' } },
  { key: 'mutual_aid', label: 'Gave / received mutual aid', section: 'Community & Aid',
    order: ['received', 'provided', 'both', 'none'] },
  { key: 'aid_recipient', label: 'Received formal aid', section: 'Community & Aid',
    valueLabels: { '1': 'Yes', '0': 'No' }, order: ['1', '0'] },
  { key: 'contradictory_info', label: 'Received contradictory information', section: 'Information',
    valueLabels: { '1': 'Yes', '0': 'No' }, order: ['1', '0'] },
  { key: 'confidence_recovery', label: 'Confidence in recovery', section: 'Future Outlook',
    valueLabels: { completely_conf: 'Completely confident', mostly_conf: 'Mostly confident', somewhat: 'Somewhat confident', not_very_conf: 'Not very confident', not_conf_all: 'Not confident at all' },
    order: ['completely_conf', 'mostly_conf', 'somewhat', 'not_very_conf', 'not_conf_all'] },
];

// ── Likert (1..5) indicators ─────────────────────────────────────────────────
// Charted as a mean score (1=low, 5=high) plus distribution; 98/99 excluded.
const LIKERT = [
  { key: 'perception_coping', label: 'Ability to cope with the situation', section: 'Priorities & Coping' },
  { key: 'perception_incontrol', label: 'Sense of being in control', section: 'Priorities & Coping' },
  { key: 'community_relations', label: 'Quality of community relations', section: 'Community & Aid' },
  { key: 'perception_coverneeds', label: 'Aid covers basic needs', section: 'Community & Aid' },
];

// ── Multi-select indicators ──────────────────────────────────────────────────
// Member 0/1 columns are discovered at runtime by the `${key}_` prefix; `labels`
// overrides the prettified suffix where the suffix is unclear.
const MULTI = [
  { key: 'current_priorities', label: 'Current priorities', section: 'Priorities & Coping',
    labels: { mental_health: 'Mental health', return: 'Return home' } },
  { key: 'coping_strategies', label: 'Coping strategies used', section: 'Priorities & Coping',
    labels: { no_unmet: 'No unmet needs', community_help: 'Community help', diaspora_help: 'Diaspora help', skip_meals: 'Skipped meals', sold_belongings: 'Sold belongings', moved_employment: 'Moved for work', loans_family: 'Loans from family', loans_moneylenders: 'Loans from moneylenders', children_school: 'Took children out of school', child_labour: 'Child labour' } },
  { key: 'tension_source', label: 'Sources of community tension', section: 'Community & Aid',
    labels: { displaced_host: 'Displaced vs host', lack_comm: 'Lack of communication' } },
  { key: 'mutual_aid_type', label: 'Types of mutual aid exchanged', section: 'Community & Aid',
    labels: { acces_aid: 'Access to aid', nfi: 'Non-food items', psycho: 'Psychosocial support' } },
  { key: 'aid_type', label: 'Types of formal aid received', section: 'Community & Aid',
    labels: { nfi: 'Non-food items', mental_health: 'Mental health', adult_edu: 'Adult education' } },
  { key: 'trust_factors', label: 'What builds trust in aid providers', section: 'Trust',
    labels: { direct_exp: 'Direct experience', word_of_mouth: 'Word of mouth' } },
  { key: 'info_how', label: 'How people get information', section: 'Information',
    labels: { face_to_face: 'Face to face', radio_tv: 'Radio / TV', social_media: 'Social media' } },
  { key: 'info_barriers', label: 'Barriers to getting information', section: 'Information',
    labels: { no_systematic: 'No systematic source', not_accessible_form: 'Not in accessible form', no_idea_where: 'No idea where to look' } },
  { key: 'info_pref_from', label: 'Preferred information sources', section: 'Information',
    labels: { local_org_staff: 'Local org staff', intl_org_staff: 'Intl org staff', friends_family: 'Friends & family' } },
  { key: 'want_know_more', label: 'Information people want more of', section: 'Information' },
  { key: 'main_fears', label: 'Main fears for the future', section: 'Future Outlook',
    labels: { losing_loved_one: 'Losing a loved one', losing_homeland: 'Losing homeland', cant_return: 'Cannot return', lost_prospects: 'Lost prospects', no_recovery: 'No recovery', no_accountability: 'No accountability', community_relations: 'Community relations', aid_dependence: 'Aid dependence', social_fabric: 'Social fabric' } },
  { key: 'plans', label: 'Plans for the future', section: 'Future Outlook',
    labels: { stay_wait: 'Stay and wait', return_home: 'Return home', relocate_lb: 'Relocate in Lebanon', leave_temp: 'Leave temporarily', leave_perm: 'Leave permanently', community_engage: 'Community engagement', education_resume: 'Resume education' } },
  { key: 'recovery_actions', label: 'Actions that would aid recovery', section: 'Future Outlook',
    labels: { reach_all: 'Reach everyone', local_power: 'Local empowerment', comm_engagement: 'Community engagement' } },
];

// ── Trust-in-actors comparison (group of likert columns) ─────────────────────
const TRUST_ACTORS = {
  section: 'Trust',
  label: 'Trust in different actors',
  actors: [
    { col: 'trust_community_leaders', label: 'Community leaders' },
    { col: 'trust_local_auth', label: 'Local authorities' },
    { col: 'trust_religion', label: 'Religious institutions' },
    { col: 'trust_natl_ngo', label: 'National NGOs' },
    { col: 'trust_civil_soc', label: 'Civil society' },
    { col: 'trust_intl_ngo', label: 'International NGOs' },
    { col: 'trust_un', label: 'UN agencies' },
    { col: 'trust_red_cross', label: 'Red Cross / Red Crescent' },
    { col: 'trust_govt', label: 'Government' },
  ],
};

// ── Perception → Expectation gap (flagship) ──────────────────────────────────
// Paired perception_<k> / expect_<k> likert columns. NB: the questionnaire
// misspells "transparency" as "transparenvy" — keep the exact column suffix.
const GAP_DIMS = [
  { suffix: 'consult', label: 'Being consulted' },
  { suffix: 'involve', label: 'Being involved in decisions' },
  { suffix: 'reach', label: 'Aid reaching those in need' },
  { suffix: 'dignity', label: 'Being treated with dignity' },
  { suffix: 'local_power', label: 'Local people having a say' },
  { suffix: 'transparenvy', label: 'Transparency' },
  { suffix: 'communicate', label: 'Being communicated with' },
  { suffix: 'feedback', label: 'Being able to give feedback' },
  { suffix: 'action', label: 'Feedback leading to action' },
];

// ── Open-text fields for qualitative (Claude) analysis ───────────────────────
// Allowlisted so the endpoint can never be pointed at an arbitrary column.
const QUALITATIVE = [
  { key: 'message_to_world', label: 'Message to the world' },
  { key: 'hope_future', label: 'Hopes for the future' },
  { key: 'anything_else', label: 'Anything else to share' },
];

module.exports = {
  prettify, NONRESPONSE, ageBucket, normDisplacement,
  DIMENSIONS, SINGLE, LIKERT, MULTI, TRUST_ACTORS, GAP_DIMS, QUALITATIVE,
};
