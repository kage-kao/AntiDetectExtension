// Tracking query params (URL cleaning) + rule-filter helper. Used by the SW.

var ADE_TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "utm_name",
  "utm_cid", "utm_reader", "utm_referrer", "utm_social", "utm_brand", "utm_pubreferrer", "utm_viz_id",
  "fbclid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "msclkid", "yclid", "ysclid", "ymclid",
  "twclid", "ttclid", "igshid", "li_fat_id", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "__hssc", "__hstc",
  "__hsfp", "mkt_tok", "oly_anon_id", "oly_enc_id", "vero_id", "vero_conv", "rb_clickid", "_openstat",
  "epik", "wickedid", "irclickid", "_gl", "srsltid"
];

function adeDomainFromFilter(f) {
  return String(f || "").replace(/^\|\|/, "").replace(/\^.*$/, "").split("/")[0].toLowerCase();
}
