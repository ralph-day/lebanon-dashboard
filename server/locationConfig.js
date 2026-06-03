// Maps SurveyCTO location codes → proper display names, regions, districts, type, coords
// Source: FinalSampleSize sheet + field coordination

const LOCATION_MAP = {
  // ── Akkar ──────────────────────────────────────────────────────────────────
  mhammaret:               { name: 'Mhammaret',              region: 'Akkar',         district: 'Akkar',              type: 'Lebanese',    target: 47, lat: 34.514, lng: 36.003 },
  nahr_el_bared:           { name: 'Nahr el Bared Camp',     region: 'North',         district: 'El Minieh-Dennie',   type: 'Palestinian', target: 29, lat: 34.490, lng: 35.960 },

  // ── Beirut ─────────────────────────────────────────────────────────────────
  moussaybeth:             { name: 'Moussaytbeh',            region: 'Beirut',        district: 'Beirut',             type: 'Lebanese',    target: 77, lat: 33.880, lng: 35.492 },
  ras_beyrouth:            { name: 'Ras Beyrouth',           region: 'Beirut',        district: 'Beirut',             type: 'Lebanese',    target: 47, lat: 33.894, lng: 35.479 },
  ain_el_mreisseh:         { name: 'Ain el-Mreisseh',        region: 'Beirut',        district: 'Beirut',             type: 'Lebanese',    target: 34, lat: 33.900, lng: 35.487 },
  mazraa:                  { name: 'Mazraa',                 region: 'Beirut',        district: 'Beirut',             type: 'Lebanese',    target: 20, lat: 33.876, lng: 35.506 },
  camp_shatila:            { name: 'Shatila Camp',           region: 'Beirut',        district: 'Beirut',             type: 'Palestinian', target: 36, lat: 33.874, lng: 35.494 },
  camp_burje:              { name: 'Burj el-Barajne Camp',   region: 'Beirut',        district: 'Beirut',             type: 'Palestinian', target: 64, lat: 33.858, lng: 35.502 },

  // ── Bekaa ──────────────────────────────────────────────────────────────────
  kafr_middle_school:      { name: 'Kfarmeshki',             region: 'Bekaa',         district: 'Rachaya',            type: 'Lebanese',    target: 25, lat: 33.546, lng: 35.710 },
  al_mashreq_school:       { name: 'Daher el-Ahmar',         region: 'Bekaa',         district: 'Rachaya',            type: 'Lebanese',    target: 15, lat: 33.573, lng: 35.748 },
  hermon_association:      { name: 'Rachaya',                region: 'Bekaa',         district: 'Rachaya',            type: 'Lebanese',    target: 5,  lat: 33.500, lng: 35.870 },
  kokba_municipal:         { name: 'Kaukaba',                region: 'Bekaa',         district: 'Rachaya',            type: 'Lebanese',    target: 5,  lat: 33.482, lng: 35.900 },
  scout_city_qab_elias:    { name: 'Qab Elias',              region: 'Bekaa',         district: 'Zahle',              type: 'Lebanese',    target: 5,  lat: 33.693, lng: 35.870 },
  bouaraj_clinic:          { name: 'Bouaraj',                region: 'Bekaa',         district: 'Zahle',              type: 'Lebanese',    target: 5,  lat: 33.722, lng: 35.905 },
  alkhanasa_building:      { name: 'Bouaraj (2)',            region: 'Bekaa',         district: 'Zahle',              type: 'Lebanese',    target: 5,  lat: 33.725, lng: 35.910 },
  ana_middle_school:       { name: 'Aaneh',                  region: 'Bekaa',         district: 'West Beqaa',         type: 'Lebanese',    target: 13, lat: 33.627, lng: 35.812 },
  'cultural_club_al-qaraoun': { name: 'Qaraoun',             region: 'Bekaa',         district: 'West Beqaa',         type: 'Lebanese',    target: 13, lat: 33.592, lng: 35.784 },
  baaloul_club:            { name: 'Baaloul',                region: 'Bekaa',         district: 'West Beqaa',         type: 'Lebanese',    target: 6,  lat: 33.601, lng: 35.773 },
  our_lady_church_aitnit:  { name: 'Aitnit (1)',             region: 'Bekaa',         district: 'West Beqaa',         type: 'Lebanese',    target: 5,  lat: 33.472, lng: 35.732 },
  greek_catholic_archdiocese_aitnit: { name: 'Aitnit (2)',   region: 'Bekaa',         district: 'West Beqaa',         type: 'Lebanese',    target: 5,  lat: 33.470, lng: 35.730 },

  // ── Mount Lebanon ──────────────────────────────────────────────────────────
  bchamoun:                { name: 'Bchamoun',               region: 'Mount Lebanon', district: 'Aley',               type: 'Lebanese',    target: 58, lat: 33.782, lng: 35.523 },
  choueifat_el_quoubbeh:   { name: 'Choueifat El-Quoubbeh',  region: 'Mount Lebanon', district: 'Aley',               type: 'Lebanese',    target: 24, lat: 33.800, lng: 35.510 },
  keyfoun:                 { name: 'Keyfoun',                region: 'Mount Lebanon', district: 'Aley',               type: 'Lebanese',    target: 16, lat: 33.815, lng: 35.590 },
  dibbiyeh:                { name: 'Dibbiyeh',               region: 'Mount Lebanon', district: 'Chouf',              type: 'Lebanese',    target: 24, lat: 33.694, lng: 35.471 },
  barja:                   { name: 'Barja',                  region: 'Mount Lebanon', district: 'Chouf',              type: 'Lebanese',    target: 20, lat: 33.712, lng: 35.454 },
  jiyeh:                   { name: 'Jiyeh',                  region: 'Mount Lebanon', district: 'Chouf',              type: 'Lebanese',    target: 17, lat: 33.669, lng: 35.469 },
  naameh:                  { name: 'Naameh',                 region: 'Mount Lebanon', district: 'Chouf',              type: 'Lebanese',    target: 13, lat: 33.727, lng: 35.462 },
  lassa:                   { name: 'Lassa',                  region: 'Mount Lebanon', district: 'Jbeil',              type: 'Lebanese',    target: 49, lat: 34.120, lng: 35.650 },
  aalmat_ech_chamliyeh:    { name: 'Aalmat Ech-Chamliyeh',   region: 'Mount Lebanon', district: 'Jbeil',              type: 'Lebanese',    target: 25, lat: 34.148, lng: 35.660 },
  aalmat_el_jnoubiyeh:     { name: 'Aalmat Ej-Jnoubiyeh',    region: 'Mount Lebanon', district: 'Jbeil',              type: 'Lebanese',    target: 21, lat: 34.143, lng: 35.655 },
  faraya:                  { name: 'Faraya',                 region: 'Mount Lebanon', district: 'Kesrwane',           type: 'Lebanese',    target: 24, lat: 33.990, lng: 35.892 },
  ghazir:                  { name: 'Ghazir',                 region: 'Mount Lebanon', district: 'Kesrwane',           type: 'Lebanese',    target: 23, lat: 33.984, lng: 35.659 },
  maaysra_kesrouane:       { name: 'Maaysra Kesrouane',      region: 'Mount Lebanon', district: 'Kesrwane',           type: 'Lebanese',    target: 19, lat: 33.993, lng: 35.680 },

  // ── North ──────────────────────────────────────────────────────────────────
  batroun:                 { name: 'Batroun',                region: 'North',         district: 'El Batroun',         type: 'Lebanese',    target: 22, lat: 34.254, lng: 35.658 },
  Beddawi:                 { name: 'Beddaoui',               region: 'North',         district: 'El Minieh-Dennie',   type: 'Lebanese',    target: 48, lat: 34.462, lng: 35.851 },
  zouq_bhanninne:          { name: 'Zouq Bhannine',          region: 'North',         district: 'El Minieh-Dennie',   type: 'Lebanese',    target: 22, lat: 34.432, lng: 35.848 },
  beddawi_camp:            { name: 'Baddawi Camp',           region: 'North',         district: 'El Minieh-Dennie',   type: 'Palestinian', target: 71, lat: 34.483, lng: 35.851 },

  // ── South ──────────────────────────────────────────────────────────────────
  saida_ed_dekermane:      { name: 'Saida Ed-Dekermane',     region: 'South',         district: 'Saida',              type: 'Lebanese',    target: 16, lat: 33.566, lng: 35.374 },
  saida_el_oustani:        { name: 'Saida El-Oustani',       region: 'South',         district: 'Saida',              type: 'Lebanese',    target: 14, lat: 33.560, lng: 35.365 },
  haret_saida:             { name: 'Haret Saida',            region: 'South',         district: 'Saida',              type: 'Lebanese',    target: 14, lat: 33.558, lng: 35.362 },
};

const REGION_ORDER = ['Beirut', 'Mount Lebanon', 'North', 'South', 'Bekaa', 'Akkar'];

module.exports = { LOCATION_MAP, REGION_ORDER };
