import 'package:flutter/material.dart';
import '../../app_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../models/domain.dart';
import '../checkout/checkout_screen.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({required this.cart, super.key});
  final CartController cart;

  @override
  Widget build(BuildContext context) {
    if (cart.lines.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Your basket', style: TextStyle(fontWeight: FontWeight.w900))),
        body: const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.shopping_bag_outlined, size: 56, color: AppTokens.green), SizedBox(height: 12), Text('Your basket is empty', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18))])),
      );
    }
    const delivery = 5.0;
    const platform = 1.0;
    const gst = .18;
    final total = cart.subtotal + delivery + platform + gst;

    return Scaffold(
      appBar: AppBar(title: const Text('Your basket', style: TextStyle(fontWeight: FontWeight.w900))),
      body: Column(
        children: [
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: cart.lines.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, i) => _line(cart.lines[i]),
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
            decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(24)), boxShadow: [BoxShadow(blurRadius: 18, color: Color(0x14000000), offset: Offset(0, -8))]),
            child: Column(
              children: [
                const Row(children: [Icon(Icons.lock_outline_rounded, size: 17, color: AppTokens.green), SizedBox(width: 7), Text('Transparent AasPass checkout', style: TextStyle(fontWeight: FontWeight.w800))]),
                const SizedBox(height: 10),
                _row('Item total', cart.subtotal),
                _row('Delivery', delivery),
                _row('AasPass platform fee', platform),
                _row('GST on platform fee', gst),
                const Divider(height: 20),
                _row('Total', total, bold: true),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => CheckoutScreen(cart: cart)),
                    ),
                    child: const Text('Proceed to pay'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _line(CartLine line) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppTokens.border)),
      child: Row(
        children: [
          SizedBox(width: 70, height: 70, child: Image.asset(line.product.image, fit: BoxFit.contain)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(line.product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)), const SizedBox(height: 4), Text(line.product.unit, style: const TextStyle(color: AppTokens.muted, fontSize: 11)), const SizedBox(height: 8), Text('₹${line.total.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16))])),
          Container(
            decoration: BoxDecoration(color: AppTokens.mint, borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              IconButton(onPressed: () => cart.decrement(line.product), icon: const Icon(Icons.remove_rounded, size: 17, color: AppTokens.green), constraints: const BoxConstraints(minWidth: 36, minHeight: 40), padding: EdgeInsets.zero),
              Text('${line.quantity}', style: const TextStyle(fontWeight: FontWeight.w900)),
              IconButton(onPressed: () => cart.add(line.product), icon: const Icon(Icons.add_rounded, size: 17, color: AppTokens.green), constraints: const BoxConstraints(minWidth: 36, minHeight: 40), padding: EdgeInsets.zero),
            ]),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, double amount, {bool bold = false}) => Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Row(children: [Expanded(child: Text(label, style: TextStyle(fontWeight: bold ? FontWeight.w900 : FontWeight.w600))), Text('₹${amount.toStringAsFixed(2)}', style: TextStyle(fontWeight: bold ? FontWeight.w900 : FontWeight.w700, fontSize: bold ? 17 : 13))]));
}
