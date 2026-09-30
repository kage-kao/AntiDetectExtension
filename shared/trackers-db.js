// Tracking query params (URL cleaning) + rule-filter helper. Used by the SW.
//
// IMPORTANT: keep every entry [A-Za-z0-9_]+ only — bg/rules.js interpolates them
// raw into an RE2 alternation, so dots/dashes would need escaping.

var ADE_TRACKING_PARAMS = [
  // Google / DoubleClick / Analytics
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "utm_name",
  "utm_cid", "utm_reader", "utm_referrer", "utm_referer", "utm_social", "utm_brand", "utm_pubreferrer",
  "utm_viz_id", "utm_source_platform", "utm_creative_format", "utm_marketing_tactic", "utm_swu",
  "utm_keyword", "utm_campaignid", "utm_adgroup", "utm_adset", "utm_creative", "utm_placement",
  "utm_network", "utm_device", "utm_matchtype", "utm_email", "utm_csr", "utm_ctr",
  "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "gad", "gad_source", "_gl", "srsltid",
  "ga_source", "ga_medium", "ga_term", "ga_content", "ga_campaign", "_ga",
  "ved", "ei", "sxsrf", "iflsig", "sourceid", "gs_lcp",
  // Facebook / Instagram / Meta
  "fbclid", "fb_action_ids", "fb_action_types", "fb_ref", "fb_source", "igshid", "igsh",
  // Microsoft / Yandex / other click ids
  "msclkid", "yclid", "ysclid", "ymclid", "twclid", "ttclid", "li_fat_id", "epik", "qclid",
  "wickedid", "irclickid", "irgwc", "irpid", "iradid", "rb_clickid", "ScCid",
  // HubSpot / Marketo / Eloqua / Pardot / Salesforce
  "_hsenc", "_hsmi", "__hssc", "__hstc", "__hsfp", "hsCtaTracking",
  "hsa_acc", "hsa_cam", "hsa_grp", "hsa_ad", "hsa_src", "hsa_tgt", "hsa_kw", "hsa_mt", "hsa_net", "hsa_ver",
  "mkt_tok", "elqTrackId", "elqTrack", "elqaid", "elqat",
  "spJobID", "spMailingID", "spReportId", "spUserID",
  // Mailchimp / mailing / CRM
  "mc_cid", "mc_eid", "ml_subscriber", "ml_subscriber_hash", "dm_i", "_ke",
  "cm_mmc", "cm_ven", "cm_cat", "cm_pla", "cm_ite",
  "trk_contact", "trk_msg", "trk_module", "trk_sid",
  // Adobe / AT Internet / Matomo
  "s_cid", "s_kwcid", "ef_id", "ICID", "cmpid",
  "at_medium", "at_campaign", "at_creation", "at_variant", "xtor", "intcid",
  "pk_campaign", "pk_kwd", "pk_source", "pk_medium", "pk_content", "pk_cid",
  "piwik_campaign", "piwik_kwd",
  // Branch / Oly / Vero / Viglink / misc trackers
  "_branch_match_id", "_branch_referrer", "oly_anon_id", "oly_enc_id",
  "vero_id", "vero_conv", "vgo_ee", "_openstat", "__twitter_impression",
  "obOrigUrl", "smid", "smtyp", "ref_src", "ref_url", "spm", "scm", "pvid",
  "ranMID", "ranEAID", "ranSiteID", "click_id", "clickid", "icid",
  // Google Ads ValueTrack leftovers (ads-system specific, no generic web usage)
  "campaignid", "adgroupid", "adid", "feeditemid", "targetid", "matchtype",
  "loc_interest_ms", "loc_physical_ms"
];

function adeDomainFromFilter(f) {
  return String(f || "").replace(/^\|\|/, "").replace(/\^.*$/, "").split("/")[0].toLowerCase();
}
