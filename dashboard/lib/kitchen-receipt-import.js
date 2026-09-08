// One-time, owner-requested import from the supplied September 7 GIANT receipt.
// Only delivered groceries are included. No address, account or payment data.
const core=require('../kitchen-core');
const IMPORT_ID='giant-delivery-2026-09-07-v1';
// Name, delivered quantity, unit, storage, package/brand details.
const items=[
  ['Ginger & probiotics tea',1,'pack','Pantry','Bigelow caffeine-free lemon ginger; 18 tea bags'],
  ['Mango juice',1,'pack','Fridge','Simply All Natural; 52 fl oz bottle'],
  ['Flour tortillas',1,'pack','Pantry','Mission large burrito tortillas; 8 count, 20 oz'],
  ['French bread',1,'each','Pantry','Our Brand bakery French bread, unsliced; 16 oz loaf'],
  ['White bread',1,'each','Pantry','Pepperidge Farm Farmhouse hearty white; 24 oz loaf'],
  ['Honey oat Cheerios',1,'pack','Pantry','Cheerios Oat Crunch oats & honey multigrain; 18.2 oz box'],
  ['Blueberry breakfast bars',1,'pack','Pantry','belVita Crunchy Blueberry; 5 packs, 8.8 oz box'],
  ['Cranberry orange breakfast bars',1,'pack','Pantry','belVita Crunchy Cranberry Orange; 5 packs, 8.8 oz box'],
  ['Mayonnaise',1,'pack','Pantry','Hellmann’s Light; 30 oz jar; refrigerate after opening'],
  ['Coconut Greek yogurt',4,'each','Fridge','Chobani low-fat coconut blended; one 4-pack, 21.2 oz total'],
  ['Key lime Greek yogurt',4,'each','Fridge','Chobani low-fat key lime blended; one 4-pack, 21.2 oz total'],
  ['Sour cream',1,'pack','Fridge','Daisy light sour cream; 14 oz squeeze container'],
  ['Butter spread',1,'pack','Fridge','Land O Lakes butter spread with olive oil & sea salt; 13 oz tub'],
  ['Half & half',3,'pack','Fridge','Land O Lakes fat-free; 1 quart each'],
  ['2% milk',1,'pack','Fridge','Our Brand reduced-fat milk; half gallon'],
  ['Shredded Mexican cheese',1,'pack','Fridge','Our Brand finely shredded Mexican style 4 cheese blend; 8 oz'],
  ['Shredded triple cheddar',1,'pack','Fridge','Our Brand finely shredded triple cheddar blend; 8 oz'],
  ['Shredded Mexican cheese (reduced fat)',1,'pack','Fridge','Our Brand reduced-fat finely shredded Mexican style 4 cheese blend; 7 oz'],
  ['Whipped cream cheese',1,'pack','Fridge','Our Brand whipped cream cheese spread; 12 oz tub'],
  ['Swiss cheese slices',1,'pack','Fridge','Sargento natural Swiss; 11 slices, 7 oz'],
  ['Hummus',1,'pack','Fridge','Nature’s Promise organic gluten-free original hummus; 8 oz tub'],
  ['White American cheese',1.49,'lb','Fridge','Our Brand deli white American cheese, regular sliced; delivered weight'],
  ['Feta crumbles',1,'pack','Fridge','President; 6 oz tub'],
  ['Sliced turkey',1,'pack','Fridge','True Story organic oven-roasted turkey breast; 6 oz'],
  ['Sliced ham',1,'pack','Fridge','True Story organic uncured applewood-smoked ham; 6 oz'],
  ['Buttermilk & vanilla waffles',1,'pack','Freezer','Kodiak protein thick & fluffy; 6 waffles, 14.82 oz'],
  ['Frozen mango',1,'pack','Freezer','Our Brand mango chunks; 48 oz'],
  ['Ground turkey',2,'lb','Fridge','Nature’s Promise 93% lean / 7% fat; two 16 oz packages'],
  ['Chicken breasts',2.42,'lb','Fridge','Nature’s Promise natural boneless skinless chicken breasts; delivered weight'],
  ['Chicken thighs',3.43,'lb','Fridge','Nature’s Promise natural boneless skinless chicken thighs; delivered weight'],
  ['Blueberries',1,'pack','Fridge','1 dry pint'],
  ['Cherry tomatoes',1,'pack','Pantry','16 oz package'],
  ['Bananas',1,'pack','Pantry','Chiquita; 1 bunch, listed as 4–6 count'],
  ['Curly kale',1,'pack','Fridge','1 bunch'],
  ['Blackberries',1,'pack','Fridge','Driscoll’s; 6 oz'],
  ['Raspberries',1,'pack','Fridge','Driscoll’s red raspberries; 6 oz'],
  ['Gala apples',1,'pack','Fridge','3 lb bag'],
  ['Avocados',3,'each','Pantry','Hass avocados'],
  ['English cucumbers',3,'each','Fridge','Hot House English seedless; one 3-count package'],
  ['Baby carrots',1,'pack','Fridge','Our Brand peeled baby carrots; 1 lb bag'],
  ['Bell peppers',3,'each','Fridge','Our Brand rainbow bell peppers; one 3-count package'],
  ['Campari tomatoes',1,'pack','Pantry','Taste of Inspirations; 16 oz'],
  ['Red grapes',1,'pack','Fridge','Taste of Inspirations Sparkle seedless red grapes; 2 lb package'],
  ['Yogurt trail mix',1,'pack','Pantry','Paradise Valley Smart Snacking Yogurt Boost Mix; 7 oz'],
  ['Pretzel sticks',1,'pack','Pantry','Snyder’s of Hanover low-fat pretzel sticks, family size; 16 oz'],
  ['Vanilla yogurt raisins',1,'pack','Pantry','Sun-Maid vanilla yogurt-covered raisins; 6 oz box, 6 count'],
  ['Applesauce pouches',1,'pack','Pantry','Our Brand squeezable applesauce; 12 pouches, 38 oz box'],
  ['Canned tomatoes with basil',2,'pack','Pantry','Tuttorosso crushed tomatoes with basil; 28 oz can each'],
];
function importReceipt(data,id){
  if(data.imports?.includes(IMPORT_ID))return {data,changed:false};
  let next=data;
  for(const [name,quantity,unit,place,details]of items){
    next=core.apply(next,{action:'stock-save',data:{name,quantity,unit,place,bestBefore:'',notes:`${details}. GIANT delivery Sep 7, 2026.`}},id,'2026-09-07T00:00:00Z');
  }
  next.imports=[...(data.imports||[]),IMPORT_ID];
  return {data:next,changed:true};
}
module.exports={importReceipt,items,IMPORT_ID};
