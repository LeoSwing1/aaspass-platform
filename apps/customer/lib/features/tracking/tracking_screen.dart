import 'package:flutter/material.dart';
import '../../core/api/aaspass_api.dart';
import '../../core/theme/app_theme.dart';

class TrackingScreen extends StatefulWidget {
  const TrackingScreen({required this.orderId, super.key});
  final String orderId;
  @override State<TrackingScreen> createState() => _TrackingScreenState();
}
class _TrackingScreenState extends State<TrackingScreen> {
  Map<String, dynamic> data = {};
  @override void initState() { super.initState(); _load(); }
  Future<void> _load() async { try { final response = await AasPassApi.instance.tracking(widget.orderId); if (response is Map) data = Map<String, dynamic>.from(response); } catch (_) {} if (mounted) setState(() {}); }
  @override Widget build(BuildContext context) {
    const statuses = ['Order placed', 'Store confirmed', 'Preparing', 'Ready for pickup', 'Out for delivery', 'Delivered'];
    return Scaffold(appBar: AppBar(title: Text('Track ${widget.orderId}', style: const TextStyle(fontWeight: FontWeight.w900))), body: ListView(padding: const EdgeInsets.all(16), children: [Container(height: 180, decoration: BoxDecoration(color: AppTokens.mint, borderRadius: BorderRadius.circular(22)), child: const Center(child: Icon(Icons.map_rounded, size: 72, color: AppTokens.green))), const SizedBox(height: 18), const Text('Delivery timeline', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)), const SizedBox(height: 10), ...statuses.asMap().entries.map((entry) => ListTile(contentPadding: EdgeInsets.zero, leading: Container(width: 30, height: 30, decoration: BoxDecoration(color: entry.key <= 1 ? AppTokens.green : AppTokens.mint, shape: BoxShape.circle), child: Icon(entry.key <= 1 ? Icons.check_rounded : Icons.circle, size: 14, color: entry.key <= 1 ? Colors.white : AppTokens.green)), title: Text(entry.value, style: TextStyle(fontWeight: entry.key <= 1 ? FontWeight.w900 : FontWeight.w600)), subtitle: entry.key == 1 ? Text('${data['status'] ?? 'Waiting for update'}') : null))]));
  }
}
