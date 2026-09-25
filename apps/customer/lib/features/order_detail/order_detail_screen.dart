import 'package:flutter/material.dart';
import '../../core/api/aaspass_api.dart';
import '../tracking/tracking_screen.dart';

class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({required this.orderId, super.key});
  final String orderId;
  @override State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}
class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Map<String, dynamic> data = {};
  @override void initState() { super.initState(); _load(); }
  Future<void> _load() async { try { final r = await AasPassApi.instance.order(widget.orderId); if (r is Map) data = Map<String, dynamic>.from(r); } catch (_) {} if (mounted) setState(() {}); }
  @override Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Order details', style: TextStyle(fontWeight: FontWeight.w900))), body: ListView(padding: const EdgeInsets.all(16), children: [Text(widget.orderId, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)), const SizedBox(height: 8), Text('${data['vendorName'] ?? 'AasPass store'}', style: const TextStyle(color: Colors.grey)), const SizedBox(height: 18), Card(child: ListTile(title: const Text('Status', style: TextStyle(fontWeight: FontWeight.w800)), trailing: Text('${data['status'] ?? 'Pending'}', style: const TextStyle(fontWeight: FontWeight.w900)))), const SizedBox(height: 12), FilledButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TrackingScreen(orderId: widget.orderId))), child: const Text('Track order'))]));
}
