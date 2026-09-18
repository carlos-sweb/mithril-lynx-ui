// "mithril-runtime" (https://github.com/carlos-sweb/mithril-runtime) has no
// types of its own yet — it's a same-shaped subset of real Mithril (m.route/
// m.trust/m.request removed, see that repo's README). Reusing @types/mithril
// here is a deliberate approximation, same pattern mithril-lynx v2's own
// consuming apps use: it still types m.route/m.trust/m.request as present,
// which mithril-runtime doesn't have — nothing in this package's v2-migrated
// components references those.
declare module "mithril-runtime" {
	import m from "mithril";
	export = m;
}
