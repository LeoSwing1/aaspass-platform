import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app_controller.dart';
import '../../core/api/aaspass_api.dart';
import '../../core/services/location_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui.dart';
import '../../data/content_data.dart';
import '../../models/domain.dart';
import '../../core/widgets/melt_header.dart';
import '../cart/cart_screen.dart';
import '../orders/orders_screen.dart';
import '../search/search_screen.dart';
import '../store/store_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    required this.cart,
    required this.location,
    required this.onOpenAccount,
    super.key,
  });

  final CartController cart;
  final LocationService location;
  final VoidCallback onOpenAccount;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final searchController = TextEditingController();
  final bannerController = PageController(viewportFraction: 0.94);

  Timer? bannerTimer;
  int bannerIndex = 0;
  bool locating = false;
  String locationLabel = 'Set delivery location';

  List<Vendor> vendors = const [];
  List<Category> categories = const [];
  List<Product> products = const [];
  Map<String, dynamic> personalized = const {};
  bool loadingData = true;
  String? loadError;

  @override
  void initState() {
    super.initState();
    bannerTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !bannerController.hasClients) return;
      final next = (bannerIndex + 1) % creativeBanners.length;
      bannerController.animateToPage(
        next,
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeOutCubic,
      );
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrapLocation());
    _refresh();
  }

  @override
  void dispose() {
    bannerTimer?.cancel();
    bannerController.dispose();
    searchController.dispose();
    super.dispose();
  }

  Future<void> _bootstrapLocation() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    final prompted = prefs.getBool('aaspass_location_prompted_v2') ?? false;
    if (widget.location.position != null) {
      setState(() => locationLabel = widget.location.label ?? 'Current location');
      return;
    }
    if (prompted) return;

    await prefs.setBool('aaspass_location_prompted_v2', true);
    if (!mounted) return;
    final useLocation = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Use your location?', style: TextStyle(fontWeight: FontWeight.w900)),
        content: const Text(
          'AasPass uses your location to show nearby shops, local products and more accurate delivery estimates. Your device controls the final permission.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Not now')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Use location')),
        ],
      ),
    );
    if (useLocation == true && mounted) await _locate();
  }

  Future<void> _refresh() async {
    if (mounted) setState(() { loadingData = true; loadError = null; });
    try {
      final categoryResponse = await AasPassApi.instance.categories();
      final vendorResponse = await AasPassApi.instance.vendors(
        latitude: widget.location.position?.latitude,
        longitude: widget.location.position?.longitude,
      );
      final nextCategories = categoryResponse.map((item) {
        final slug = '${item['slug'] ?? item['name']}'.toLowerCase();
        return Category(
          id: '${item['id']}', name: '${item['name']}',
          image: _categoryImage(slug), subtitle: '${item['subtitle'] ?? ''}',
        );
      }).toList();
      final nextVendors = vendorResponse.map(Vendor.fromJson).toList();
      final feedResponse = await AasPassApi.instance.personalizedFeed();
      final productLists = await Future.wait(nextVendors.take(8).map((v) => AasPassApi.instance.vendorProducts(v.id)));
      final nextProducts = <Product>[];
      for (final list in productLists) {
        nextProducts.addAll(list.map((raw) {
          final p = Map<String, dynamic>.from(raw);
          p['image'] = _productImage('${p['name'] ?? ''}', '${p['category_name'] ?? p['category_slug'] ?? ''}');
          return Product.fromJson(p);
        }));
      }
      if (!mounted) return;
      final feed = Map<String, dynamic>.from(feedResponse);
      Product decorate(dynamic raw) {
        final p = Map<String, dynamic>.from(raw as Map);
        p['image'] = _productImage('${p['name'] ?? ''}', '${p['category_name'] ?? p['category_slug'] ?? ''}');
        return Product.fromJson(p);
      }
      final personalizedRecommended = (feed['recommended'] is List ? (feed['recommended'] as List).map(decorate).toList() : <Product>[]);
      final recentlyBought = (feed['recentlyBought'] is List ? (feed['recentlyBought'] as List).map(decorate).toList() : <Product>[]);
      feed['recommendedProducts'] = personalizedRecommended;
      feed['recentlyBoughtProducts'] = recentlyBought;
      if (!mounted) return;
      setState(() { categories = nextCategories; vendors = nextVendors; products = nextProducts; personalized = feed; loadingData = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { loadingData = false; loadError = 'Could not connect to AasPass. Pull to retry.'; });
    }
  }

  String _categoryImage(String key) {
    if (key.contains('snack') || key.contains('chip')) return 'assets/products/chips.png';
    if (key.contains('namkeen')) return 'assets/products/bhujia.png';
    if (key.contains('beverage')) return 'assets/products/cola.png';
    if (key.contains('dairy') || key.contains('bakery')) return 'assets/products/milk.png';
    if (key.contains('fruit') || key.contains('vegetable')) return 'assets/products/banana.png';
    if (key.contains('household')) return 'assets/products/cleaner.png';
    if (key.contains('personal') || key.contains('beauty')) return 'assets/products/soap.png';
    if (key.contains('stationery')) return 'assets/products/notebook.png';
    if (key.contains('electronic') || key.contains('mobile')) return 'assets/products/cable.png';
    if (key.contains('meat') || key.contains('egg')) return 'assets/products/eggs.png';
    return 'assets/products/atta.png';
  }

  String _productImage(String name, String category) {
    final text = '$name $category'.toLowerCase();
    if (text.contains('chip') || text.contains('kurkure')) return 'assets/products/chips.png';
    if (text.contains('bhujia') || text.contains('namkeen')) return 'assets/products/bhujia.png';
    if (text.contains('milk') || text.contains('dairy')) return 'assets/products/milk.png';
    if (text.contains('banana') || text.contains('fruit') || text.contains('vegetable')) return 'assets/products/banana.png';
    if (text.contains('soap') || text.contains('dove') || text.contains('beauty')) return 'assets/products/soap.png';
    if (text.contains('ariel') || text.contains('clean')) return 'assets/products/cleaner.png';
    if (text.contains('egg')) return 'assets/products/eggs.png';
    if (text.contains('cable') || text.contains('electronics')) return 'assets/products/cable.png';
    if (text.contains('cola') || text.contains('drink')) return 'assets/products/cola.png';
    if (text.contains('notebook')) return 'assets/products/notebook.png';
    return 'assets/products/atta.png';
  }

  Future<void> _locate() async {
    if (locating) return;
    setState(() => locating = true);

    final result = await widget.location.locate();
    if (!mounted) return;
    setState(() => locating = false);

    if (result.position != null) {
      if (mounted) setState(() => locationLabel = result.label);
      final service = await AasPassApi.instance.serviceability(result.position!.latitude, result.position!.longitude);
      final serviceable = service is Map && service['serviceable'] == true;
      if (mounted && !serviceable) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('AasPass is not serviceable at this location yet.')));
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.label)),
        );
      }
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text(
          'Turn on location',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        content: Text(
          result.needsSettings
              ? 'Location access is blocked. Open settings to discover nearby stores.'
              : 'AasPass uses location for nearby stores and delivery ETA.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(context);
              if (result.serviceEnabled) {
                await widget.location.openSettings();
              } else {
                await widget.location.openLocationSettings();
              }
            },
            child: const Text('Open settings'),
          ),
        ],
      ),
    );
  }

  void _search(String query) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SearchScreen(query: query, cart: widget.cart),
      ),
    );
  }

  List<Product> _feedProducts(String key) => (personalized[key] is List ? (personalized[key] as List).whereType<Product>().toList() : <Product>[]);

  List<Map<String, dynamic>> _feedOffers() => personalized['offers'] is List
      ? (personalized['offers'] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
      : <Map<String, dynamic>>[];

  Widget _offerRail() {
    final offers = _feedOffers();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('Offers for you', 'Live offers available on your account'),
        SizedBox(
          height: 132,
          child: ListView.separated(
            padding: const EdgeInsets.only(left: 16),
            scrollDirection: Axis.horizontal,
            itemCount: offers.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final offer = offers[index];
              final type = '${offer['discount_type'] ?? ''}';
              final discountValue = double.tryParse('${offer['discount_value'] ?? 0}') ?? 0;
              final minOrder = (double.tryParse('${offer['min_order_paise'] ?? 0}') ?? 0) / 100;
              return Container(
                width: 260,
                padding: const EdgeInsets.all(15),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: AppTokens.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.local_offer_rounded, color: AppTokens.green),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${offer['title'] ?? offer['code'] ?? 'AasPass offer'}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      type == 'PERCENT' ? '$discountValue% off' : '₹${(discountValue / 100).toStringAsFixed(0)} off',
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                    ),
                    Text(
                      'Min order ₹${minOrder.toStringAsFixed(0)}',
                      style: const TextStyle(color: AppTokens.muted, fontSize: 11),
                    ),
                    const Spacer(),
                    Text(
                      'Code: ${offer['code'] ?? '—'}',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final popular = products
        .where((product) => product.popular && product.category != 'Popular Dishes')
        .take(8)
        .toList();
    final food = products
        .where((product) => product.category == 'Popular Dishes')
        .take(8)
        .toList();
    final deals = products
        .where((product) =>
            product.badge == 'DEAL' ||
            product.badge == 'VALUE' ||
            product.badge == 'FRESH')
        .take(8)
        .toList();

    final slivers = <Widget>[
      SliverToBoxAdapter(child: _header()),
      SliverToBoxAdapter(child: _searchRow()),
    ];
    if (loadingData) {
      slivers.add(
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(22),
            child: Column(
              children: [
                CircularProgressIndicator(strokeWidth: 2),
                SizedBox(height: 10),
                Text(
                  'Loading nearby stores & products…',
                  style: TextStyle(fontWeight: FontWeight.w700, color: AppTokens.muted),
                ),
              ],
            ),
          ),
        ),
      );
    } else if (loadError != null) {
      slivers.add(
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppTokens.border),
              ),
              child: Row(
                children: [
                  const Icon(Icons.cloud_off_rounded, color: AppTokens.offer),
                  const SizedBox(width: 10),
                  Expanded(child: Text(loadError!, style: const TextStyle(fontWeight: FontWeight.w700))),
                ],
              ),
            ),
          ),
        ),
      );
    }
    slivers.addAll([
      SliverToBoxAdapter(child: _quickShortcuts()),
      SliverToBoxAdapter(child: _cashOffer()),
      SliverToBoxAdapter(child: _heroRail()),
      SliverToBoxAdapter(child: _categoryRail()),
      SliverToBoxAdapter(child: _storeRail()),
    ]);
    final recentlyBought = _feedProducts('recentlyBoughtProducts');
    if (recentlyBought.isNotEmpty) {
      slivers.add(SliverToBoxAdapter(child: _productSection('Buy again', recentlyBought, subtitle: 'From your delivered orders')));
    }
    final recommended = _feedProducts('recommendedProducts');
    if (recommended.isNotEmpty) {
      slivers.add(SliverToBoxAdapter(child: _productSection('Picked for you', recommended, subtitle: 'Based on what you buy locally')));
    }
    if (_feedOffers().isNotEmpty) {
      slivers.add(SliverToBoxAdapter(child: _offerRail()));
    }
    if (deals.isNotEmpty) {
      slivers.add(SliverToBoxAdapter(child: _dealSection(deals)));
    }
    slivers.add(SliverToBoxAdapter(child: _productSection('Popular near you', popular)));
    if (food.isNotEmpty) {
      slivers.add(SliverToBoxAdapter(child: _productSection('Popular local food', food)));
    }
    slivers.add(const SliverToBoxAdapter(child: SizedBox(height: 32)));

    return RefreshIndicator(
      color: AppTokens.green,
      onRefresh: _refresh,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        slivers: slivers,
      ),
    );
  }

  Widget _header() {
    return MeltHeader(
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 7, 16, 12),
          child: Column(children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.bolt_rounded, size: 25), const SizedBox(width: 3),
              Expanded(child: InkWell(onTap: _locate, borderRadius: BorderRadius.circular(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(widget.location.position == null ? 'Deliver to' : 'Delivery in ${locationLabel.isEmpty ? 'your area' : 'your area'}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                const SizedBox(height: 2),
                Row(children: [const Icon(Icons.home_rounded, size: 13), const SizedBox(width: 4), Expanded(child: Text(locationLabel, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700))), const Icon(Icons.keyboard_arrow_down_rounded, size: 17)]),
              ]))),
              InkWell(onTap: widget.onOpenAccount, borderRadius: BorderRadius.circular(30), child: const CircleAvatar(radius: 23, backgroundColor: Colors.white, child: Icon(Icons.person_outline_rounded, size: 27))),
            ]),
            const SizedBox(height: 9),
            if (locating) const LinearProgressIndicator(minHeight: 2, color: AppTokens.green, backgroundColor: Colors.white54),
          ]),
        ),
      ),
    );
  }
  Widget _searchRow() {
    return Container(
      color: AppTokens.limeHeader,
      padding: const EdgeInsets.fromLTRB(16, 2, 16, 12),
      child: Row(
        children: [
          Expanded(
            child: Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(29),
              ),
              child: Row(
                children: [
                  const Icon(Icons.search_rounded, size: 28),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: searchController,
                      onSubmitted: _search,
                      decoration: const InputDecoration(
                        border: InputBorder.none,
                        isDense: true,
                        hintText: "Search 'chocolates'",
                      ),
                      style: const TextStyle(fontSize: 17),
                    ),
                  ),
                  IconButton(
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 38),
                    onPressed: () => _search(searchController.text),
                    icon: const Icon(Icons.mic_none_rounded, size: 27),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          _headerAction(Icons.receipt_long_rounded, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersScreen()))),
          const SizedBox(width: 7),
          _cartAction(),
        ],
      ),
    );
  }

  Widget _headerAction(IconData icon, {VoidCallback? onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(28),
      child: Container(
        width: 47,
        height: 56,
        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
        child: Icon(icon, size: 25),
      ),
    );
  }

  Widget _cartAction() {
    final count = widget.cart.lines.fold<int>(0, (sum, line) => sum + line.quantity);
    return InkWell(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(cart: widget.cart))),
      borderRadius: BorderRadius.circular(28),
      child: Badge(
        isLabelVisible: count > 0,
        label: Text('$count'),
        child: Container(
          width: 47,
          height: 56,
          decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
          child: const Icon(Icons.shopping_bag_outlined, size: 25),
        ),
      ),
    );
  }

  Widget _quickShortcuts() {
    const items = <_Shortcut>[
      _Shortcut('Deals', Icons.sell_outlined, 'DEAL'),
      _Shortcut('Fresh', Icons.local_grocery_store_outlined, 'Fruits & Veg'),
      _Shortcut('Food', Icons.restaurant_outlined, 'Popular Dishes'),
      _Shortcut('Beauty', Icons.spa_outlined, 'Beauty'),
      _Shortcut('Pets', Icons.pets_outlined, 'Pet Care'),
    ];

    return Container(
      color: AppTokens.limeHeader,
      height: 108,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 5),
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, _) => Container(
          width: 1,
          margin: const EdgeInsets.symmetric(vertical: 8),
          color: AppTokens.limeLine,
        ),
        itemBuilder: (_, index) {
          final item = items[index];
          return SizedBox(
            width: 142,
            child: InkWell(
              onTap: () => _search(item.query),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(item.icon, size: 31),
                  const SizedBox(height: 7),
                  Text(
                    item.label,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _cashOffer() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 9),
      child: Container(
        height: 154,
        padding: const EdgeInsets.fromLTRB(23, 18, 20, 11),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF3C8),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTokens.limeStrong, width: 5),
        ),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text.rich(
              TextSpan(
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: AppTokens.ink,
                ),
                children: [
                  TextSpan(text: 'Use '),
                  TextSpan(
                    text: '₹20 AASPASS CASH',
                    style: TextStyle(color: AppTokens.green),
                  ),
                ],
              ),
            ),
            SizedBox(height: 8),
            Text('No minimum order value', style: TextStyle(fontSize: 15)),
            Spacer(),
            Row(
              children: [
                Icon(Icons.alarm_outlined, size: 22),
                SizedBox(width: 8),
                Text(
                  'Expires soon',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                ),
              ],
            ),
            SizedBox(height: 3),
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                '*T&C apply',
                style: TextStyle(fontSize: 9, color: AppTokens.muted),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _heroRail() {
    return Column(
      children: [
        SizedBox(
          height: 190,
          child: PageView.builder(
            controller: bannerController,
            itemCount: creativeBanners.length,
            onPageChanged: (value) => setState(() => bannerIndex = value),
            itemBuilder: (_, index) {
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(19),
                  child: Image.asset(
                    creativeBanners[index],
                    fit: BoxFit.cover,
                    cacheWidth: 900,
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 7),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(
            creativeBanners.length,
            (index) => AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: index == bannerIndex ? 19 : 6,
              height: 5,
              decoration: BoxDecoration(
                color: index == bannerIndex ? AppTokens.green : Colors.black12,
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _categoryRail() {
    final items = categories.take(10).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('Shop by category', 'Everyday needs from nearby stores'),
        SizedBox(
          height: 125,
          child: ListView.separated(
            padding: const EdgeInsets.only(left: 16),
            scrollDirection: Axis.horizontal,
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(width: 9),
            itemBuilder: (_, index) {
              final category = items[index];
              return SizedBox(
                width: 104,
                child: InkWell(
                  onTap: () => _search(category.name),
                  borderRadius: BorderRadius.circular(15),
                  child: Container(
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(15),
                      border: Border.all(color: AppTokens.border),
                    ),
                    child: Column(
                      children: [
                        Expanded(
                          child: Image.asset(
                            category.image,
                            fit: BoxFit.contain,
                            cacheWidth: 180,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          category.name,
                          maxLines: 2,
                          textAlign: TextAlign.center,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _storeRail() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('Stores near you', 'Real neighbourhood stores'),
        SizedBox(
          height: 218,
          child: ListView.builder(
            padding: const EdgeInsets.only(left: 16),
            scrollDirection: Axis.horizontal,
            itemCount: vendors.length,
            itemBuilder: (_, index) {
              final vendor = vendors[index];
              return Padding(
                padding: const EdgeInsets.only(right: 10),
                child: SizedBox(
                  width: 180,
                  child: VendorCard(
                    vendor: vendor,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => StoreScreen(
                          vendorId: vendor.id,
                          vendor: vendor,
                          cart: widget.cart,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _dealSection(List<Product> items) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 19, 16, 10),
          child: Container(
            height: 86,
            padding: const EdgeInsets.symmetric(horizontal: 17),
            decoration: BoxDecoration(
              color: AppTokens.greenDark,
              borderRadius: BorderRadius.circular(18),
            ),
            child: const Row(
              children: [
                Icon(Icons.local_offer_outlined, color: Colors.white, size: 31),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'DAILY FRESH DEALS',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Text(
                  'BUY LOCAL\nSAVE MORE',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ),
        _productRail(items),
      ],
    );
  }

  Widget _productSection(String title, List<Product> items, {String subtitle = 'Picked from nearby stores'}) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        _sectionTitle(title, subtitle),
        _productRail(items),
      ],
    );
  }

  Widget _productRail(List<Product> items) {
    return SizedBox(
      height: 292,
      child: ListView.builder(
        padding: const EdgeInsets.only(left: 16),
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        itemBuilder: (_, index) {
          return Padding(
            padding: const EdgeInsets.only(right: 10),
            child: SizedBox(
              width: 184,
              child: ProductCard(product: items[index], cart: widget.cart),
            ),
          );
        },
      ),
    );
  }

  Widget _sectionTitle(String title, String subtitle) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(17, 21, 17, 11),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: const TextStyle(fontSize: 11, color: AppTokens.muted),
                ),
              ],
            ),
          ),
          const Icon(Icons.arrow_forward_ios_rounded, size: 14),
        ],
      ),
    );
  }
}

class _Shortcut {
  const _Shortcut(this.label, this.icon, this.query);
  final String label;
  final IconData icon;
  final String query;
}
