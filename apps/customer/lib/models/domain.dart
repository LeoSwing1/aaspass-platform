class Category {
  final String id;
  final String name;
  final String image;
  final String subtitle;
  const Category({required this.id, required this.name, required this.image, this.subtitle = ''});
}

class Vendor {
  final String id;
  final String name;
  final String category;
  final String image;
  final double rating;
  final int ratingCount;
  final double lat;
  final double lng;
  final int prepMinutes;
  final bool open;
  final String area;
  final List<String> tags;
  final double distanceKm;
  final int etaMinutes;
  final bool serviceable;
  const Vendor({required this.id, required this.name, required this.category, required this.image, required this.rating, required this.ratingCount, required this.lat, required this.lng, required this.prepMinutes, required this.open, required this.area, required this.tags, this.distanceKm = 0, this.etaMinutes = 0, this.serviceable = true});
  factory Vendor.fromJson(Map<String, dynamic> j) => Vendor(
    id: '${j['id']}', name: '${j['name'] ?? j['displayName']}', category: '${j['category'] ?? j['plan_name'] ?? ''}', image: '${j['image'] ?? j['image_url'] ?? 'assets/vendors/vendor_daily.png'}', rating: (j['rating'] as num?)?.toDouble() ?? 0, ratingCount: (j['ratingCount'] as num?)?.toInt() ?? (j['review_count'] as num?)?.toInt() ?? 0, lat: (j['lat'] as num?)?.toDouble() ?? (j['latitude'] as num?)?.toDouble() ?? 0, lng: (j['lng'] as num?)?.toDouble() ?? (j['longitude'] as num?)?.toDouble() ?? 0, prepMinutes: (j['prepMinutes'] as num?)?.toInt() ?? 10, open: j['open'] != false && j['is_open'] != false, area: '${j['area'] ?? j['locality'] ?? j['city'] ?? ''}', tags: (j['tags'] as List? ?? const []).map((e) => '$e').toList(), distanceKm: (j['distanceKm'] as num?)?.toDouble() ?? (j['distance_km'] as num?)?.toDouble() ?? 0, etaMinutes: (j['etaMinutes'] as num?)?.toInt() ?? 0, serviceable: j['serviceable'] != false,
  );
}

class Product {
  final String id;
  final String vendorId;
  final String name;
  final String unit;
  final double price;
  final String category;
  final String image;
  final bool available;
  final bool popular;
  final String badge;
  const Product({required this.id, required this.vendorId, required this.name, required this.unit, required this.price, required this.category, required this.image, this.available = true, this.popular = false, this.badge = ''});
  factory Product.fromJson(Map<String, dynamic> j) => Product(id: '${j['id']}', vendorId: '${j['vendorId'] ?? j['vendor_id']}', name: '${j['name']}', unit: '${j['unit'] ?? j['unit_label'] ?? ''}', price: (j['price'] as num?)?.toDouble() ?? ((j['price_paise'] as num?)?.toDouble() ?? 0) / 100, category: '${j['category'] ?? j['category_name'] ?? j['category_slug'] ?? 'General'}', image: '${j['image'] ?? j['image_url'] ?? 'assets/products/atta.png'}', available: j['available'] != false && (j['is_active'] != false) && ((j['stock_qty'] as num?)?.toInt() ?? 1) > 0, popular: j['popular'] == true, badge: '${j['badge'] ?? ''}');
}

class CartLine {
  final Product product;
  final int quantity;
  const CartLine(this.product, this.quantity);
  double get total => product.price * quantity;
  Map<String, dynamic> toJson() => {'product': {'id': product.id, 'vendorId': product.vendorId, 'name': product.name, 'unit': product.unit, 'price': product.price, 'category': product.category, 'image': product.image}, 'quantity': quantity};
  factory CartLine.fromJson(Map<String, dynamic> j) => CartLine(Product.fromJson(Map<String, dynamic>.from(j['product'] as Map)), (j['quantity'] as num).toInt());
}

class Address {
  final String id;
  final String label;
  final String line1;
  final String city;
  final String state;
  final String postalCode;
  final double? latitude;
  final double? longitude;
  const Address({required this.id, required this.label, required this.line1, required this.city, required this.state, required this.postalCode, this.latitude, this.longitude});
}

class OrderSummary {
  final String id;
  final String vendorName;
  final String status;
  final double subtotal;
  final double deliveryFee;
  final double platformFee;
  final double platformGst;
  final double total;
  final DateTime createdAt;
  const OrderSummary({required this.id, required this.vendorName, required this.status, required this.subtotal, required this.deliveryFee, required this.platformFee, required this.platformGst, required this.total, required this.createdAt});
  factory OrderSummary.fromJson(Map<String, dynamic> j) => OrderSummary(id: '${j['id']}', vendorName: '${j['vendorName'] ?? ''}', status: '${j['status'] ?? ''}', subtotal: (j['subtotal'] as num?)?.toDouble() ?? 0, deliveryFee: (j['deliveryFee'] as num?)?.toDouble() ?? 0, platformFee: (j['platformFee'] as num?)?.toDouble() ?? 0, platformGst: (j['platformGst'] as num?)?.toDouble() ?? 0, total: (j['total'] as num?)?.toDouble() ?? 0, createdAt: DateTime.tryParse('${j['createdAt']}') ?? DateTime.now());
}
