import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/api/aaspass_api.dart';
import 'models/domain.dart';

class CartController extends ChangeNotifier {
  static const _key = 'aaspass_cart_v3';
  List<CartLine> lines = const [];
  bool syncing = false;
  String? syncError;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw != null && raw.isNotEmpty) {
      try {
        lines = (jsonDecode(raw) as List)
            .map((e) => CartLine.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
      } catch (_) {}
    }
    try {
      final server = await AasPassApi.instance.cart();
      final items = server['items'];
      if (items is List && items.isNotEmpty) {
        final vendorId = '${server['vendorId'] ?? ''}';
        lines = items.whereType<Map>().map((raw) {
          final j = Map<String, dynamic>.from(raw);
          return CartLine(Product(
            id: '${j['productId']}', vendorId: vendorId, name: '${j['name'] ?? 'Product'}',
            unit: '${j['unit'] ?? ''}', price: ((j['pricePaise'] as num?)?.toDouble() ?? 0) / 100,
            category: '${j['category'] ?? 'General'}', image: '${j['imageUrl'] ?? 'assets/products/atta.png'}',
          ), (j['quantity'] as num?)?.toInt() ?? 1);
        }).toList();
      }
    } catch (_) {}
    notifyListeners();
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(lines.map((e) => e.toJson()).toList()));
  }

  Future<void> _syncServer() async {
    if (lines.isEmpty) {
      syncing = true; syncError = null; notifyListeners();
      try {
        // The backend requires a vendor to save a cart. A previous order clears the server cart;
        // there is no fake local-only order path.
        final vendorId = await SharedPreferences.getInstance().then((p) => p.getString('aaspass_last_cart_vendor'));
        if (vendorId != null && vendorId.isNotEmpty) {
          await AasPassApi.instance.syncCart(vendorId: vendorId, items: const []);
        }
      } catch (e) { syncError = '$e'; }
      finally { syncing = false; notifyListeners(); }
      return;
    }
    syncing = true; syncError = null; notifyListeners();
    try {
      final vendorId = lines.first.product.vendorId;
      await AasPassApi.instance.syncCart(
        vendorId: vendorId,
        items: lines.map((e) => {'productId': e.product.id, 'quantity': e.quantity}).toList(),
      );
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('aaspass_last_cart_vendor', vendorId);
    } catch (e) { syncError = '$e'; }
    finally { syncing = false; notifyListeners(); }
  }

  bool add(Product product) {
    if (lines.isNotEmpty && lines.first.product.vendorId != product.vendorId) {
      return false;
    }
    final next = [...lines];
    final index = next.indexWhere((e) => e.product.id == product.id);
    if (index < 0) {
      next.add(CartLine(product, 1));
    } else {
      next[index] = CartLine(product, next[index].quantity + 1);
    }
    lines = next; notifyListeners(); _persist(); _syncServer(); return true;
  }

  void decrement(Product product) {
    final index = lines.indexWhere((e) => e.product.id == product.id);
    if (index < 0) return;
    final next = [...lines]; final line = next[index];
    if (line.quantity <= 1) {
      next.removeAt(index);
    } else {
      next[index] = CartLine(product, line.quantity - 1);
    }
    lines = next; notifyListeners(); _persist(); _syncServer();
  }

  double get subtotal => lines.fold(0, (sum, line) => sum + line.total);
  int quantity(Product p) => lines.where((e) => e.product.id == p.id).fold(0, (sum, e) => sum + e.quantity);
  void clear() { lines = const []; notifyListeners(); _persist(); _syncServer(); }
}
