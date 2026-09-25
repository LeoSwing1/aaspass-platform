INSERT INTO vendor_plans (code,name,monthly_price_paise,features) VALUES
('STARTER','Starter',19900,'{"analytics":false,"promotedPlacement":false,"staffAccounts":1}'),
('BUSINESS','Business',49900,'{"analytics":true,"promotedPlacement":true,"staffAccounts":3}'),
('PRO','Pro',99900,'{"analytics":true,"promotedPlacement":true,"staffAccounts":10}')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,monthly_price_paise=EXCLUDED.monthly_price_paise,features=EXCLUDED.features;
INSERT INTO categories(name,slug,icon_key,sort_order) VALUES
('Groceries','groceries','shopping_basket',10),('Snacks & Chips','snacks-chips','cookie',20),('Namkeen','namkeen','food_bank',30),('Beverages','beverages','local_drink',40),('Dairy & Bakery','dairy-bakery','bakery_dining',50),('Fruits & Vegetables','fruits-vegetables','eco',60),('Staples','staples','grain',70),('Household','household','home',80),('Personal Care','personal-care','spa',90),('Baby Care','baby-care','child_friendly',100),('Stationery','stationery','menu_book',110),('Electronics','electronics','devices',120),('Frozen','frozen','ac_unit',130),('Pet Care','pet-care','pets',140),('Fresh Meat & Eggs','meat-eggs','egg',150),('Beauty','beauty','face',160),('Home & Kitchen','home-kitchen','kitchen',170),('Mobiles & Accessories','mobiles-accessories','phone_android',180)
ON CONFLICT(slug) DO NOTHING;

-- Development seed: one vendor and a small real-looking catalog so all role surfaces can share data.
WITH owner AS (
  INSERT INTO users(phone,name,role) VALUES('+919999999999','AasPass Vendor','VENDOR_OWNER')
  ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,role='VENDOR_OWNER',updated_at=NOW()
  RETURNING id
), plan AS (
  SELECT id FROM vendor_plans WHERE code='BUSINESS' LIMIT 1
), vendor AS (
  INSERT INTO vendors(owner_user_id,plan_id,name,slug,status,rating,review_count,is_open,phone,address_line1,locality,city,state,postal_code,latitude,longitude)
  SELECT owner.id,plan.id,'AasPass Development Vendor','aaspass-development-vendor','ACTIVE',4.8,128,TRUE,'+919999999999','1 AasPass Test Market','Gomti Nagar','Lucknow','Uttar Pradesh','226010',26.8467,80.9462
  FROM owner,plan ON CONFLICT(owner_user_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,status='ACTIVE',is_open=TRUE,updated_at=NOW()
  RETURNING id,plan_id
)
INSERT INTO vendor_members(vendor_id,user_id,role) SELECT vendor.id,owner.id,'VENDOR_OWNER' FROM vendor,owner
ON CONFLICT(vendor_id,user_id) DO NOTHING;

WITH v AS (SELECT id FROM vendors WHERE slug='aaspass-development-vendor'), p AS (SELECT id FROM vendor_plans WHERE code='BUSINESS'), k AS (
  SELECT id FROM categories WHERE slug='snacks-chips' LIMIT 1
)
INSERT INTO products(vendor_id,category_id,name,description,unit_label,price_paise,stock_qty,is_active)
SELECT v.id,k.id,'Kurkure Masala Munch','Spicy snack pack','90 g',2000,50,TRUE FROM v,k
ON CONFLICT DO NOTHING;
WITH v AS (SELECT id FROM vendors WHERE slug='aaspass-development-vendor'), k AS (SELECT id FROM categories WHERE slug='namkeen' LIMIT 1)
INSERT INTO products(vendor_id,category_id,name,description,unit_label,price_paise,stock_qty,is_active)
SELECT v.id,k.id,'Aloo Bhujia','Classic namkeen','200 g',5800,36,TRUE FROM v,k
ON CONFLICT DO NOTHING;
WITH v AS (SELECT id FROM vendors WHERE slug='aaspass-development-vendor'), k AS (SELECT id FROM categories WHERE slug='household' LIMIT 1)
INSERT INTO products(vendor_id,category_id,name,description,unit_label,price_paise,stock_qty,is_active)
SELECT v.id,k.id,'Vim Dishwash Gel','Everyday household essential','500 ml',9500,24,TRUE FROM v,k
ON CONFLICT DO NOTHING;
