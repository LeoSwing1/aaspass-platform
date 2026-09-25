import 'package:flutter/material.dart';
import '../../core/api/aaspass_api.dart';
import '../../core/theme/app_theme.dart';
import '../../models/domain.dart';
import '../../app_controller.dart';
import '../cart/cart_screen.dart';
import '../tracking/tracking_screen.dart';
import '../order_detail/order_detail_screen.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({this.cart, super.key});
  final CartController? cart;
  @override State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<OrderSummary> orders = const [];
  bool loading = true;
  @override void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try {
      final data = await AasPassApi.instance.orders();
      orders = data.map((e) => OrderSummary.fromJson(Map<String, dynamic>.from(e))).toList();
    } catch (_) {}
    if (mounted) setState(() => loading = false);
  }
  Future<void> _reorder(OrderSummary order) async {
    try {
      final result = await AasPassApi.instance.reorderOrder(order.id);
      if (widget.cart != null) await widget.cart!.restore();
      if (!mounted) return;
      final skipped = result['skipped'] is List ? (result['skipped'] as List).length : 0;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(skipped > 0 ? 'Available items added to your basket. $skipped item(s) were unavailable.' : 'Your previous order is back in the basket.')));
      if (widget.cart != null) {
        Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(cart: widget.cart!)));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().contains('CART_HAS_ANOTHER_VENDOR') ? 'Your basket contains items from another store. Empty it before buying again.' : 'Could not add this order again.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Your orders', style: TextStyle(fontWeight: FontWeight.w900))),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : orders.isEmpty
              ? const Center(child: Text('No orders yet', style: TextStyle(fontWeight: FontWeight.w800)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    itemCount: orders.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (_, i) {
                      final order = orders[i];
                      return Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppTokens.border)),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [Expanded(child: Text(order.vendorName.isEmpty ? 'AasPass order' : order.vendorName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900))), Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5), decoration: BoxDecoration(color: AppTokens.mint, borderRadius: BorderRadius.circular(9)), child: Text(order.status, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: AppTokens.greenDark)))]),
                          const SizedBox(height: 8),
                          Text('Order ${order.id}', style: const TextStyle(fontSize: 11, color: AppTokens.muted)),
                          const SizedBox(height: 8),
                          Row(children: [Text('₹${order.total.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)), const Spacer(), TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: order.id))), child: const Text('Details')), if(order.status == 'DELIVERED') OutlinedButton(onPressed: () => _reorder(order), child: const Text('Buy again')), OutlinedButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TrackingScreen(orderId: order.id))), child: const Text('Track'))]),
                        ]),
                      );
                    },
                  ),
                ),
    );
  }
}
