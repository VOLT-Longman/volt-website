// Permanent operator exclusions, approved 2026-10-18 after the official image audit.
// Never restore via upstream patches, reconciliation, or candidate promotion.
// Restoration requires a new explicit owner decision. Missing photos on NEW ships
// do not automatically exclude them. Keep upstream snapshots and private records.
export const SHIP_CATALOG_EXCLUSIONS = Object.freeze([
  ['600i-executive-edition', '600i Executive Edition', 'orig_600i_executive_edition', '38ae749f-d4fc-4dfd-907b-ed8db61f3d88'],
  ['caterpillar-pirate', 'Caterpillar Pirate', 'drak_caterpillar_pirate', '565d8121-50a9-4920-af50-f176caef0431'],
  ['constellation-phoenix-emerald', 'Constellation Phoenix Emerald', 'rsi_constellation_phoenix_emerald', 'daf936a1-689f-4edb-980a-96947e2727c4'],
  ['dragonfly-star-kitten', 'Dragonfly Star Kitten', 'drak_dragonfly_pink', 'd868dfb9-5bcd-4f7b-a40a-3aa5bbf7d705'],
  ['f7c-m-hornet-heartseeker-mk-ii', 'F7C-M Hornet Heartseeker Mk II', 'anvl_hornet_f7cm_mk2_heartseeker', '6f8bfcc3-2ade-4976-a8e9-fd07de5c3601'],
  ['f8a-lightning', 'F8A Lightning', 'anvl_lightning_f8', '1e837261-78d9-4d5b-b17c-90d312d6a3dd'],
  ['gladius-dunlevy', 'Gladius Dunlevy', 'aegs_gladius_dunlevy', 'af7d6591-bec1-442b-8d90-cd1bc6db4162'],
  ['nautilus-solstice-edition', 'Nautilus Solstice Edition', null, null],
].map(([id, name, localName, ref]) => Object.freeze({ id, name, localName, ref })));

const normalize = (value) => typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
const excluded = new Set(SHIP_CATALOG_EXCLUSIONS.flatMap((entry) => Object.values(entry).map(normalize)).filter(Boolean));

// Exact identities only: never remove a base model because its edition is excluded.
export function isExcludedShip(...identities) {
  return identities.some((value) => {
    if (typeof value === 'string') return excluded.has(normalize(value));
    if (!value || typeof value !== 'object') return false;
    return [value.id, value.voltId, value.name, value.localName, value.erkulLocalName, value.ref, value.erkulRef,
      value.data?.ref, value.data?.name].some((identity) => excluded.has(normalize(identity)));
  });
}

export function withoutExcludedShips(layer) {
  return Object.fromEntries(Object.entries(layer).filter(([id, entry]) => !isExcludedShip(id, entry)));
}
