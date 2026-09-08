# Family kitchen

The family-facing navigation is Meals, Pantry, and Shopping list. Pantry is a
single compact list grouped by food type, such as meat, cheese, dairy, produce
and staples. Short names combine variants like yoghurt in one expandable row.
Package quantities, locations, dates, notes and editing controls appear only
when expanded. Labels and categories can be changed in the item editor without
renaming recipe ingredients or losing individual packages. Copy uses everyday wording: Back to
ideas, Update what’s left in the pantry, and Put groceries away.

The owner supplied a GIANT receipt for September 7, 2026 and requested its import.
`lib/kitchen-receipt-import.js` adds its 48 delivered product lines under the
existing board row lock. An import marker prevents repeats, including after a
family member removes or uses an item. It preserves existing contents, excludes
undelivered bagels/gyro bread, and keeps measured weights and package details.
No best-before dates, address, account or payment details are imported.

The home screen's dinner button opens `#meals`. The kitchen has a meal board,
pantry/fridge/freezer inventory, and a shared grocery list. Family sign-in is
required for changes. It starts with existing scheduled meal events and no
invented pantry contents. Past plans are not automatically marked as cooked.

## Everyday workflow

1. Add food on hand, including quantities, storage locations and optional dates.
2. Add a meal with ingredients, a recipe link and family notes. Schedule it with
   Plan or drag its card onto a day. Planned dinners appear in the calendar.
3. On Grocery list, add missing ingredients for the selected week. Repeating
   this action adds only additional shortages. Manual groceries remain intact.
4. Copy the list or open each item's GIANT product search. The family chooses
   products and adds them to the retailer's cart. No order is placed by this app.
5. When groceries arrive, check them off and put them away. Edit a grocery's
   destination before putting it away; add package dates in Food on hand.
6. Mark a meal Cooked. Optionally deduct recorded ingredient quantities, using
   the earliest dated batch first. Make again creates a new plan and retains
   history. Family feedback and favorite markers stay with the meal.

Quantities match case-insensitive ingredient names and exact units. There is no
guessing that one pack equals a pound or that a cup equals a weight. Use the same
units in inventory and recipes. The app does not infer consumption, spoilage,
retailer purchases or household contents. Check dates are planning reminders.

## Research, September 2026

- [Paprika](https://www.paprikaapp.com/help/ios/) connects recipes, menus, a pantry
  with quantities/dates, and groceries. This informed the pantry-aware workflow.
- [AnyList](https://help.anylist.com/articles/feature-overview-online-shopping/)
  guides shoppers item by item through supported stores. GIANT Direct is not in
  its published supported-retailer list. Its apps support Instacart.
- [Mealime](https://support.mealime.com/article/151-getting-started-guide) generates
  a grocery list from planned recipes. Here, manual staples are preserved.
- [GIANT](https://giantfoodstores.com/) offers pickup and delivery. The product
  search route is `/product-search/<encoded ingredient>`. No supported public
  GIANT Direct cart-write API was verified, so this implementation provides
  explicit search links and copy/export, not a claimed cart integration.

## Persistence and maintenance

`api/kitchen.js` creates the additive `kitchen_board` table in the existing
PostgreSQL database, importing Meals events once. Commands use existing family
authentication, row locks and expected versions to prevent lost edits or double
deductions. Meal calendar changes commit in the same transaction, and expire the
legacy events cache. Board data is fetched on focus and every minute while visible.
Kitchen changes broadcast to calendar readers in other tabs.

Later meal additions, rescheduling and title edits in the calendar reconcile
into planned kitchen cards. Removing a scheduled event returns its meal to Ideas;
cooked history remains intact.
Automated tests cover inventory, shortages, repeat meals, validation, transaction
boundaries, stale writes, and the main view interactions. No real food or shopping
data is added by the tests.
