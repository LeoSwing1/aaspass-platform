import 'package:flutter/material.dart';
import '../../core/api/aaspass_api.dart';
import '../../core/theme/app_theme.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override State<NotificationsScreen> createState() => _NotificationsScreenState();
}
class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> data = const [];
  @override void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try {
      final response = await AasPassApi.instance.notifications();
      data = response.map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {}
    if (mounted) setState(() {});
  }
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications', style: TextStyle(fontWeight: FontWeight.w900))),
      body: data.isEmpty
          ? const Center(child: Text('You’re all caught up.', style: TextStyle(fontWeight: FontWeight.w800)))
          : ListView.separated(
              padding: const EdgeInsets.all(16), itemCount: data.length, separatorBuilder: (_, _) => const SizedBox(height: 8), itemBuilder: (_, i) {
                final item = data[i];
                return Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTokens.border)), child: Row(children: [const Icon(Icons.notifications_active_outlined, color: AppTokens.green), const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${item['title'] ?? 'AasPass update'}', style: const TextStyle(fontWeight: FontWeight.w900)), const SizedBox(height: 4), Text('${item['body'] ?? ''}', style: const TextStyle(color: AppTokens.muted))]))]));
              }),
    );
  }
}
