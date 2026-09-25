import 'package:flutter/material.dart';

import '../../app_controller.dart';
import '../../core/api/aaspass_api.dart';
import '../../core/theme/app_theme.dart';
import '../../models/domain.dart';

class WishlistScreen extends StatefulWidget {
  const WishlistScreen({required this.cart, super.key});
  final CartController cart;

  @override
  State<WishlistScreen> createState() => _WishlistScreenState();
}

class _WishlistScreenState extends State<WishlistScreen> {
  List<Map<String, dynamic>> items = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final value = await AasPassApi.instance.wishlist();
      if (mounted) setState(() => items = value);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not load your wishlist.')),
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _remove(String id) async {
    try {
      await AasPassApi.instance.removeWishlist(id);
      if (mounted) setState(() => items.removeWhere((x) => '${x['product_id']}' == id));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not remove that item.')),
        );
      }
    }
  }

  Product _productFrom(Map<String, dynamic> x) {
    return Product(
      id: '${x['product_id']}',
      vendorId: '${x['vendor_id']}',
      name: '${x['name'] ?? 'Product'}',
      unit: '${x['unit_label'] ?? ''}',
      price: (int.tryParse('${x['price_paise'] ?? 0}') ?? 0) / 100,
      category: '${x['category_name'] ?? 'General'}',
      image: '${x['image_url'] ?? 'assets/products/atta.png'}',
      available: x['is_active'] != false && (int.tryParse('${x['stock_qty'] ?? 0}') ?? 0) > 0,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Wishlist', style: TextStyle(fontWeight: FontWeight.w900))),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: items.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 150),
                        Icon(Icons.favorite_border_rounded, size: 60, color: AppTokens.muted),
                        SizedBox(height: 14),
                        Center(child: Text('Your wishlist is empty', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final product = _productFrom(items[index]);
                        return Card(
                          child: ListTile(
                            contentPadding: const EdgeInsets.all(10),
                            leading: ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Image.asset(
                                product.image,
                                width: 58,
                                height: 58,
                                fit: BoxFit.cover,
                                errorBuilder: (_, _, _) => const SizedBox(
                                  width: 58,
                                  height: 58,
                                  child: Icon(Icons.shopping_bag_outlined),
                                ),
                              ),
                            ),
                            title: Text(product.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                            subtitle: Text('₹${product.price.toStringAsFixed(2)} • ${items[index]['vendor_name'] ?? ''}'),
                            trailing: Wrap(
                              spacing: 2,
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.add_shopping_cart_outlined),
                                  onPressed: product.available
                                      ? () {
                                          if (widget.cart.add(product)) {
                                            ScaffoldMessenger.of(context).showSnackBar(
                                              const SnackBar(content: Text('Added to cart')),
                                            );
                                          }
                                        }
                                      : null,
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline),
                                  onPressed: () => _remove(product.id),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}

class ShoppingListsScreen extends StatefulWidget {
  const ShoppingListsScreen({super.key});

  @override
  State<ShoppingListsScreen> createState() => _ShoppingListsScreenState();
}

class _ShoppingListsScreenState extends State<ShoppingListsScreen> {
  List<Map<String, dynamic>> lists = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final value = await AasPassApi.instance.shoppingLists();
      if (mounted) setState(() => lists = value);
    } catch (_) {
      // Keep the screen usable when the account service is temporarily unavailable.
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _create() async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('New shopping list'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'List name'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, controller.text.trim()), child: const Text('Create')),
        ],
      ),
    );
    controller.dispose();
    if (name == null || name.isEmpty) return;
    try {
      await AasPassApi.instance.createShoppingList(name);
      await _load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not create the list.')));
    }
  }

  Future<void> _delete(String id) async {
    try {
      await AasPassApi.instance.deleteShoppingList(id);
      await _load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not delete the list.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Shopping lists', style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [IconButton(onPressed: _create, icon: const Icon(Icons.add_rounded))],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : lists.isEmpty
              ? ListView(
                  children: const [
                    SizedBox(height: 150),
                    Icon(Icons.playlist_add_rounded, size: 58, color: AppTokens.muted),
                    SizedBox(height: 12),
                    Center(child: Text('Create a list for repeat shopping', style: TextStyle(fontWeight: FontWeight.w800))),
                  ],
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: lists.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final list = lists[index];
                      final rawItems = list['items'];
                      final itemCount = rawItems is List ? rawItems.length : 0;
                      return Card(
                        child: ListTile(
                          title: Text('${list['name']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text('$itemCount item${itemCount == 1 ? '' : 's'}'),
                          leading: const CircleAvatar(
                            backgroundColor: AppTokens.mint,
                            child: Icon(Icons.list_alt_rounded, color: AppTokens.green),
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () => _delete('${list['id']}'),
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}

class ReviewsScreen extends StatefulWidget {
  const ReviewsScreen({super.key});

  @override
  State<ReviewsScreen> createState() => _ReviewsScreenState();
}

class _ReviewsScreenState extends State<ReviewsScreen> {
  List<Map<String, dynamic>> reviews = [];
  List<Map<String, dynamic>> eligible = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await AasPassApi.instance.reviews();
      final rawReviews = data['reviews'];
      final rawEligible = data['eligible'];
      if (mounted) {
        setState(() {
          reviews = rawReviews is List
              ? rawReviews.whereType<Map>().map((x) => Map<String, dynamic>.from(x)).toList()
              : [];
          eligible = rawEligible is List
              ? rawEligible.whereType<Map>().map((x) => Map<String, dynamic>.from(x)).toList()
              : [];
        });
      }
    } catch (_) {
      // The empty state remains valid if no review data is available.
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _review(Map<String, dynamic> item) async {
    var rating = 5;
    final controller = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text('Rate ${item['product_name']}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  5,
                  (index) => IconButton(
                    onPressed: () => setLocal(() => rating = index + 1),
                    icon: Icon(
                      index < rating ? Icons.star : Icons.star_border,
                      color: AppTokens.green,
                    ),
                  ),
                ),
              ),
              TextField(
                controller: controller,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Review (optional)'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Submit')),
          ],
        ),
      ),
    );

    if (ok == true) {
      try {
        await AasPassApi.instance.saveReview(
          orderId: '${item['order_id']}',
          productId: '${item['product_id']}',
          rating: rating,
          reviewText: controller.text.trim().isEmpty ? null : controller.text.trim(),
        );
        await _load();
      } catch (_) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not save the review.')));
      }
    }
    controller.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ratings & Reviews', style: TextStyle(fontWeight: FontWeight.w900))),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (eligible.isNotEmpty) ...[
                    const Text('Rate your recent purchases', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    ...eligible.map(
                      (item) => Card(
                        child: ListTile(
                          title: Text('${item['product_name']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text('${item['vendor_name'] ?? ''}'),
                          trailing: FilledButton.tonal(onPressed: () => _review(item), child: const Text('Rate')),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                  ],
                  const Text('Your reviews', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  if (reviews.isEmpty)
                    const Padding(padding: EdgeInsets.all(30), child: Text('No reviews yet.'))
                  else
                    ...reviews.map(
                      (item) => Card(
                        child: ListTile(
                          title: Text('${item['product_name']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text('${item['vendor_name'] ?? ''}\n${item['review_text'] ?? ''}'),
                          isThreeLine: true,
                          trailing: Text('★ ${item['rating']}', style: const TextStyle(fontWeight: FontWeight.w900, color: AppTokens.green)),
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

class SavedPaymentsScreen extends StatefulWidget {
  const SavedPaymentsScreen({super.key});

  @override
  State<SavedPaymentsScreen> createState() => _SavedPaymentsScreenState();
}

class _SavedPaymentsScreenState extends State<SavedPaymentsScreen> {
  List<Map<String, dynamic>> methods = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final value = await AasPassApi.instance.savedPayments();
      if (mounted) setState(() => methods = value);
    } catch (_) {
      // Empty state is intentional when no provider methods are saved.
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Saved Payments', style: TextStyle(fontWeight: FontWeight.w900))),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : methods.isEmpty
              ? ListView(
                  padding: const EdgeInsets.all(24),
                  children: const [
                    SizedBox(height: 100),
                    Icon(Icons.credit_card_off_outlined, size: 58, color: AppTokens.muted),
                    SizedBox(height: 14),
                    Center(child: Text('No saved payment methods', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
                    SizedBox(height: 8),
                    Center(child: Text('AasPass only stores provider-issued references, never your card number or CVV.', textAlign: TextAlign.center, style: TextStyle(color: AppTokens.muted))),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: methods.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final item = methods[index];
                    return Card(
                      child: ListTile(
                        leading: const Icon(Icons.credit_card_rounded),
                        title: Text('${item['brand'] ?? item['provider'] ?? 'Payment method'} •••• ${item['last4'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text(item['is_default'] == true ? 'Default payment method' : 'Saved securely by provider'),
                      ),
                    );
                  },
                ),
    );
  }
}

class GiftCardsScreen extends StatefulWidget {
  const GiftCardsScreen({super.key});

  @override
  State<GiftCardsScreen> createState() => _GiftCardsScreenState();
}

class _GiftCardsScreenState extends State<GiftCardsScreen> {
  List<Map<String, dynamic>> cards = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await AasPassApi.instance.giftCards();
      final raw = data['cards'];
      if (mounted) {
        setState(() {
          cards = raw is List ? raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : [];
        });
      }
    } catch (_) {
      // Keep the empty state when there are no cards or the service is unavailable.
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _redeem() async {
    final controller = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Redeem gift card'),
        content: TextField(
          controller: controller,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(labelText: 'Gift card code'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, controller.text.trim()), child: const Text('Redeem')),
        ],
      ),
    );
    controller.dispose();
    if (code == null || code.isEmpty) return;

    try {
      final key = 'gift-${DateTime.now().microsecondsSinceEpoch}';
      final data = await AasPassApi.instance.redeemGiftCard(code: code, idempotencyKey: key);
      if (mounted) {
        final amount = (int.tryParse('${data['amountPaise'] ?? 0}') ?? 0) / 100;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('₹${amount.toStringAsFixed(2)} added to Wallet')));
      }
      await _load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Gift card could not be redeemed. Check the code and try again.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Gift Cards', style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [IconButton(onPressed: _redeem, icon: const Icon(Icons.add_card_rounded))],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: cards.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 140),
                        Icon(Icons.card_giftcard_outlined, size: 60, color: AppTokens.muted),
                        SizedBox(height: 14),
                        Center(child: Text('No gift cards yet', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
                        SizedBox(height: 8),
                        Center(child: Text('Gift cards issued to your AasPass account will appear here.', style: TextStyle(color: AppTokens.muted))),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: cards.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final item = cards[index];
                        final balance = (int.tryParse('${item['balance_paise'] ?? 0}') ?? 0) / 100;
                        return Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(color: AppTokens.green, borderRadius: BorderRadius.circular(22)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('AasPass Gift Card', style: TextStyle(color: Colors.white70)),
                              const SizedBox(height: 6),
                              Text('•••• ${item['code_last4'] ?? ''}', style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900)),
                              const SizedBox(height: 18),
                              Text('₹${balance.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w900)),
                              Text('${item['status'] ?? ''}', style: const TextStyle(color: Colors.white70)),
                            ],
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}

class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key});

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  List<Map<String, dynamic>> sessions = [];
  bool loading = true;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final value = await AasPassApi.instance.securitySessions();
      if (mounted) setState(() => sessions = value);
    } catch (_) {
      // Keep an empty state on temporary service failure.
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _revoke() async {
    setState(() => busy = true);
    try {
      final data = await AasPassApi.instance.revokeOtherSessions();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${data['revokedCount'] ?? 0} other session(s) signed out')),
        );
      }
      await _load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not revoke other sessions.')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy & security', style: TextStyle(fontWeight: FontWeight.w900))),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(18),
              children: [
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(color: AppTokens.mint, borderRadius: BorderRadius.circular(18)),
                  child: const Row(
                    children: [
                      Icon(Icons.shield_outlined, color: AppTokens.green, size: 30),
                      SizedBox(width: 12),
                      Expanded(child: Text('Your AasPass session data is stored server-side and active sessions can be revoked.', style: TextStyle(fontWeight: FontWeight.w700))),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                const Text('Active sessions', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                if (sessions.isEmpty)
                  const Text('No active sessions found.')
                else
                  ...sessions.map(
                    (item) => Card(
                      child: ListTile(
                        leading: Icon(item['current'] == true ? Icons.phone_android_rounded : Icons.devices_other_rounded),
                        title: Text(item['current'] == true ? 'This device' : 'Signed-in device', style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text('${item['user_agent'] ?? 'Unknown device'}\nLast seen: ${item['last_seen_at'] ?? '—'}'),
                        isThreeLine: true,
                        trailing: item['current'] == true ? const Chip(label: Text('Current')) : null,
                      ),
                    ),
                  ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: busy ? null : _revoke,
                    icon: const Icon(Icons.logout_rounded),
                    label: Text(busy ? 'Signing out…' : 'Sign out other sessions'),
                  ),
                ),
              ],
            ),
    );
  }
}
