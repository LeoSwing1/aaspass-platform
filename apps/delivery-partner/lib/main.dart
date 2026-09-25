import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const _green = Color(0xFF0B7A53);
const _greenDark = Color(0xFF075C3E);
const _mint = Color(0xFFEAF7F1);
const _bg = Color(0xFFF5F8F6);
const _ink = Color(0xFF17221C);
const _muted = Color(0xFF6D776F);
const _line = Color(0xFFE1E9E4);
const _orange = Color(0xFFE36A2D);
const _apiBase = String.fromEnvironment(
  'AASPASS_API_BASE_URL',
  defaultValue: 'http://10.0.2.2:4100/api/v1',
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AasPassDeliveryApp());
}

class AasPassDeliveryApp extends StatelessWidget {
  const AasPassDeliveryApp({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(seedColor: _green).copyWith(
      primary: _green,
      secondary: _orange,
      surface: Colors.white,
    );
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'AasPass Delivery',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: _bg,
        colorScheme: scheme,
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: _line)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: _line)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: _green, width: 1.2)),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: Colors.white,
          indicatorColor: _mint,
          height: 78,
          labelTextStyle: WidgetStateProperty.resolveWith((states) => TextStyle(fontSize: 10.5, fontWeight: states.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600, color: states.contains(WidgetState.selected) ? _greenDark : _muted)),
        ),
        filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(48, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)), textStyle: const TextStyle(fontWeight: FontWeight.w800))),
      ),
      home: const DeliveryGate(),
    );
  }
}

class DeliveryGate extends StatefulWidget {
  const DeliveryGate({super.key});
  @override
  State<DeliveryGate> createState() => _DeliveryGateState();
}

class _DeliveryGateState extends State<DeliveryGate> {
  bool logged = false;
  bool loading = true;
  bool busy = false;
  String phone = '';
  String otp = '';
  String msg = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      logged = (prefs.getString('aaspass_delivery_token') ?? '').isNotEmpty;
      loading = false;
    });
  }

  Future<void> _login() async {
    if (otp != '270303') {
      setState(() => msg = 'Use OTP 270303 in development mode.');
      return;
    }
    setState(() {
      busy = true;
      msg = '';
    });
    try {
      final response = await http.post(
        Uri.parse('$_apiBase/auth/dev/login'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({
          'phone': '+91${phone.replaceAll(RegExp(r'\D'), '')}',
          'otp': otp,
          'role': 'DELIVERY_PARTNER',
          'name': 'AasPass Delivery Partner',
        }),
      ).timeout(const Duration(seconds: 8));
      if (response.statusCode >= 400) throw Exception('login failed');
      final data = jsonDecode(response.body);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('aaspass_delivery_token', '${data['accessToken']}');
    } catch (e) {
      if (!mounted) return;
      setState(() { busy = false; msg = 'AasPass server connection failed. $e'; });
      return;
    }
    if (!mounted) return;
    setState(() { busy = false; logged = true; });
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (logged) return const DeliveryShell();

    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: SizedBox(
                width: constraints.maxWidth > 520 ? 500 : constraints.maxWidth,
                child: Column(children: [
                  Container(width: 72, height: 72, padding: const EdgeInsets.all(15), decoration: BoxDecoration(color: _mint, borderRadius: BorderRadius.circular(24)), child: Image.asset('assets/branding/AasPass-icon.png')),
                  const SizedBox(height: 18),
                  const Text('AasPass Delivery', style: TextStyle(fontSize: 13, color: _muted, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 5),
                  const Text('Deliver locally. Earn flexibly.', textAlign: TextAlign.center, style: TextStyle(fontSize: 29, fontWeight: FontWeight.w900, color: _ink)),
                  const SizedBox(height: 8),
                  const Text('Nearby jobs, clear earnings and a calm pickup-to-drop workflow.', textAlign: TextAlign.center, style: TextStyle(color: _muted, height: 1.45)),
                  const SizedBox(height: 22),
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('Sign in', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 6),
                        const Text('Use your registered mobile number.', style: TextStyle(fontSize: 11, color: _muted)),
                        const SizedBox(height: 18),
                        TextField(keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91 ', prefixIcon: Icon(Icons.phone_rounded)), onChanged: (v) => phone = v),
                        const SizedBox(height: 12),
                        TextField(keyboardType: TextInputType.number, obscureText: true, maxLength: 6, decoration: const InputDecoration(labelText: 'OTP', hintText: 'Development OTP: 270303', prefixIcon: Icon(Icons.lock_outline_rounded), counterText: ''), onChanged: (v) => otp = v),
                        if (msg.isNotEmpty) ...[const SizedBox(height: 8), Text(msg, style: const TextStyle(color: _orange, fontSize: 11, fontWeight: FontWeight.w700))],
                        const SizedBox(height: 14),
                        SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: busy ? null : _login, icon: busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.arrow_forward_rounded), label: Text(busy ? 'Signing in…' : 'Continue'))),
                        const SizedBox(height: 12),
                        const Text('Production authentication uses the shared AasPass identity service.', style: TextStyle(fontSize: 10.5, color: _muted)),
                      ]),
                    ),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class DeliveryShell extends StatefulWidget {
  const DeliveryShell({super.key});
  @override
  State<DeliveryShell> createState() => _DeliveryShellState();
}

class _DeliveryShellState extends State<DeliveryShell> {
  int tab = 0;
  bool online = false;
  Position? position;
  bool locationBusy = false;
  List<Map<String, dynamic>> jobs = [];
  Map<String, dynamic> profile = {};
  Map<String, dynamic> earnings = {};
  Timer? timer;
  final api = DeliveryApi();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    await _locate();
    await _refresh();
  }

  Future<void> _locate() async {
    if (locationBusy) return;
    if (mounted) setState(() => locationBusy = true);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (mounted) await _showLocationDialog(serviceDisabled: true);
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.deniedForever) {
        if (mounted) await _showLocationDialog(blocked: true);
        return;
      }
      if (permission == LocationPermission.denied) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Location permission is needed to receive nearby delivery jobs.')));
        return;
      }
      position = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
      await api.location(position!.latitude, position!.longitude);
      if (mounted) setState(() {});
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not read your current location.')));
    } finally {
      if (mounted) setState(() => locationBusy = false);
    }
  }

  Future<void> _showLocationDialog({bool blocked = false, bool serviceDisabled = false}) async {
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delivery location', style: TextStyle(fontWeight: FontWeight.w900)),
        content: Text(
          serviceDisabled
              ? 'Turn on device location so AasPass can match nearby delivery jobs.'
              : blocked
                  ? 'Location access is blocked for AasPass. Open app settings to enable it.'
                  : 'AasPass uses your current location for nearby job matching and route visibility.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Not now')),
          FilledButton(
            onPressed: () async {
              Navigator.pop(context);
              if (blocked) {
                await Geolocator.openAppSettings();
              } else {
                await Geolocator.openLocationSettings();
              }
            },
            child: const Text('Open settings'),
          ),
        ],
      ),
    );
  }

  Future<void> _refresh() async {
    try {
      if (position != null && online) await api.location(position!.latitude, position!.longitude);
      final p = await api.me();
      final e = await api.earnings();
      final j = await api.jobs(position?.latitude, position?.longitude);
      if (mounted) setState(() { profile = p; earnings = e; jobs = j; });
    } catch (_) {
      if (mounted) setState(() { profile = {}; earnings = {}; jobs = []; });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not load live delivery data. Pull to retry.')));
    }
  }

  Future<void> _toggle() async {
    final next = !online;
    try { await api.status(next ? 'AVAILABLE' : 'OFFLINE'); } catch (_) {}
    if (!mounted) return;
    setState(() => online = next);
    if (next) {
      await _refresh();
      timer?.cancel();
      timer = Timer.periodic(const Duration(seconds: 30), (_) => _refresh());
    } else {
      timer?.cancel();
    }
  }

  Future<void> _accept(String id) async {
    try { await api.accept(id); await _refresh(); } catch (_) {}
  }

  Future<void> _status(String id, String status) async {
    try { await api.statusAssignment(id, status); await _refresh(); } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      DeliveryHome(profile: profile, jobs: jobs, online: online, position: position, locationBusy: locationBusy, onLocate: _locate, onToggle: _toggle, onRefresh: _refresh, onAccept: _accept, onStatus: _status),
      JobsScreen(jobs: jobs, onRefresh: _refresh, onAccept: _accept),
      EarningsScreen(data: earnings),
      DeliveryProfile(profile: profile),
    ];
    return Scaffold(
      body: SafeArea(child: IndexedStack(index: tab, children: pages)),
      bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (v) => setState(() => tab = v), destinations: const [
        NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
        NavigationDestination(icon: Icon(Icons.local_shipping_outlined), selectedIcon: Icon(Icons.local_shipping_rounded), label: 'Jobs'),
        NavigationDestination(icon: Icon(Icons.wallet_outlined), selectedIcon: Icon(Icons.wallet_rounded), label: 'Earnings'),
        NavigationDestination(icon: Icon(Icons.person_outline_rounded), selectedIcon: Icon(Icons.person_rounded), label: 'Profile'),
      ]),
    );
  }
}

class DeliveryApi {
  Future<Map<String, String>> headers() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('aaspass_delivery_token');
    return {'content-type': 'application/json', if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token'};
  }

  Future<dynamic> get(String path) async {
    final response = await http.get(Uri.parse('$_apiBase$path'), headers: await headers()).timeout(const Duration(seconds: 8));
    if (response.statusCode >= 400) throw Exception(response.body);
    return jsonDecode(response.body);
  }

  Future<dynamic> post(String path, Map<String, dynamic> body) async {
    final response = await http.post(Uri.parse('$_apiBase$path'), headers: await headers(), body: jsonEncode(body)).timeout(const Duration(seconds: 8));
    if (response.statusCode >= 400) throw Exception(response.body);
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> me() async => Map<String, dynamic>.from((await get('/delivery/me'))['deliveryPartner'] ?? {});
  Future<void> status(String value) async { await post('/delivery/status', {'status': value}); }
  Future<void> location(double latitude, double longitude) async { await post('/delivery/location', {'latitude': latitude, 'longitude': longitude}); }
  Future<List<Map<String, dynamic>>> jobs(double? lat, double? lon) async {
    final query = (lat != null && lon != null) ? '?latitude=$lat&longitude=$lon&radiusKm=8' : '';
    final data = await get('/delivery/jobs$query');
    return (data['jobs'] as List).map((e) => Map<String, dynamic>.from(e)).toList();
  }
  Future<void> accept(String id) async { await post('/delivery/assignments/$id/accept', {}); }
  Future<void> statusAssignment(String id, String value) async { await post('/delivery/assignments/$id/status', {'status': value}); }
  Future<Map<String, dynamic>> earnings() async => Map<String, dynamic>.from(await get('/delivery/earnings'));
}

class DeliveryHome extends StatelessWidget {
  const DeliveryHome({required this.profile, required this.jobs, required this.online, required this.position, required this.locationBusy, required this.onLocate, required this.onToggle, required this.onRefresh, required this.onAccept, required this.onStatus, super.key});
  final Map<String, dynamic> profile;
  final List<Map<String, dynamic>> jobs;
  final bool online;
  final Position? position;
  final bool locationBusy;
  final VoidCallback onLocate;
  final VoidCallback onToggle;
  final Future<void> Function() onRefresh;
  final Future<void> Function(String) onAccept;
  final Future<void> Function(String, String) onStatus;

  @override
  Widget build(BuildContext context) {
    final earned = ((((profile['earningsTodayPaise'] ?? profile['earnings_today_paise'] ?? 0) as num) / 100)).toStringAsFixed(0);
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 30),
        children: [
          Row(children: [Container(width: 46, height: 46, padding: const EdgeInsets.all(9), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(15), border: Border.all(color: _line)), child: Image.asset('assets/branding/AasPass-icon.png')), const SizedBox(width: 11), const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Delivery partner', style: TextStyle(fontSize: 10.5, color: _muted)), Text('AasPass local network', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),])), _OnlinePill(online: online)]),
          const SizedBox(height: 18),
          AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(gradient: LinearGradient(colors: online ? const [Color(0xFF075C3E), Color(0xFF0B7A53)] : const [Color(0xFF173028), Color(0xFF25463A)]), borderRadius: BorderRadius.circular(26)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(online ? 'You are available' : 'Ready for a nearby delivery?', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
              const SizedBox(height: 7),
              Text(online ? 'AasPass is looking for suitable jobs around you.' : 'Go online when you are ready to receive short-radius work.', style: const TextStyle(color: Colors.white70, fontSize: 11, height: 1.4)),
              const SizedBox(height: 16),
              Row(children: [Expanded(child: _HeroMetric(label: 'Today', value: '₹$earned')), const SizedBox(width: 9), Expanded(child: _HeroMetric(label: 'Jobs nearby', value: '${jobs.length}')), const SizedBox(width: 9), Expanded(child: _HeroMetric(label: 'Rating', value: '${profile['rating'] ?? 4.8}'))]),
              const SizedBox(height: 14),
              SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: onToggle, style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: _greenDark), icon: Icon(online ? Icons.pause_rounded : Icons.play_arrow_rounded), label: Text(online ? 'Go offline' : 'Go online'))),
            ]),
          ),
          const SizedBox(height: 18),
          Row(children: [const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Nearby jobs', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)), Text('Short-radius opportunities', style: TextStyle(fontSize: 10.5, color: _muted))])), TextButton(onPressed: onRefresh, child: const Text('Refresh'))]),
          if (position == null) _Notice(icon: Icons.location_off_rounded, title: 'Location access needed', subtitle: 'Turn on location to improve nearby job matching.'),
          if (jobs.isEmpty) const _Notice(icon: Icons.radar_rounded, title: 'No suitable jobs yet', subtitle: 'Stay available and AasPass will surface nearby work.'),
          ...jobs.take(4).map((j) => DeliveryJobCard(job: j, onAccept: () => onAccept('${j['id']}'), onStatus: onStatus)),
        ],
      ),
    );
  }
}

class _OnlinePill extends StatelessWidget {
  const _OnlinePill({required this.online});
  final bool online;
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8), decoration: BoxDecoration(color: online ? _mint : Colors.white, borderRadius: BorderRadius.circular(30), border: Border.all(color: _line)), child: Row(children: [Container(width: 8, height: 8, decoration: BoxDecoration(color: online ? _green : _orange, shape: BoxShape.circle)), const SizedBox(width: 6), Text(online ? 'ONLINE' : 'OFFLINE', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w900, color: online ? _greenDark : _muted))]));
}

class _HeroMetric extends StatelessWidget {
  const _HeroMetric({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10), decoration: BoxDecoration(color: Colors.white.withValues(alpha:.12), borderRadius: BorderRadius.circular(14)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16)), const SizedBox(height: 2), Text(label, style: const TextStyle(color: Colors.white70, fontSize: 9))]));
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(17), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: _line)), child: Row(children: [Container(width: 42, height: 42, decoration: BoxDecoration(color: _mint, borderRadius: BorderRadius.circular(14)), child: Icon(icon, color: _green)), const SizedBox(width: 10), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w900)), const SizedBox(height: 3), Text(subtitle, style: const TextStyle(fontSize: 10.5, color: _muted, height: 1.3))]))]));
}

class DeliveryJobCard extends StatelessWidget {
  const DeliveryJobCard({required this.job, required this.onAccept, this.onStatus, super.key});
  final Map<String, dynamic> job;
  final VoidCallback onAccept;
  final Future<void> Function(String, String)? onStatus;

  @override
  Widget build(BuildContext context) {
    final dist = job['distanceKm'] as num?;
    final earn = ((job['estimatedEarningPaise'] ?? job['estimated_earning_paise'] ?? 500) as num) / 100;
    final vendor = '${job['vendorName'] ?? job['vendor_name'] ?? 'Local vendor'}';
    final pickup = '${job['pickupAddress'] ?? job['pickup_address'] ?? 'Pickup location'}';
    final drop = '${job['dropAddress'] ?? 'Drop location'}';
    return Container(margin: const EdgeInsets.only(bottom: 11), padding: const EdgeInsets.all(15), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: _line)), child: Column(children: [Row(children: [Container(width: 44, height: 44, decoration: BoxDecoration(color: _mint, borderRadius: BorderRadius.circular(14)), child: const Icon(Icons.storefront_rounded, color: _green)), const SizedBox(width: 10), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(vendor, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)), const SizedBox(height: 2), Text('${job['productSummary'] ?? 'Order ready for pickup'}', style: const TextStyle(fontSize: 10, color: _muted))])), Text('₹${earn.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: _green))]), const SizedBox(height: 11), _RouteLine(icon: Icons.store_mall_directory_outlined, label: 'Pickup', value: pickup), const SizedBox(height: 7), _RouteLine(icon: Icons.home_outlined, label: 'Drop', value: drop), const SizedBox(height: 10), Row(children: [const Icon(Icons.route_outlined, size: 16, color: _muted), const SizedBox(width: 5), Text(dist == null ? 'Nearby' : '${dist.toStringAsFixed(1)} km', style: const TextStyle(fontSize: 10.5, color: _muted)), const Spacer(), const Icon(Icons.bolt_rounded, size: 16, color: _orange), const SizedBox(width: 4), const Text('Short radius', style: TextStyle(fontSize: 10.5, color: _muted))]), const SizedBox(height: 13), Row(children: [Expanded(child: FilledButton(onPressed: onAccept, child: const Text('Accept job'))), const SizedBox(width: 9), OutlinedButton(onPressed: () => _details(context), style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)), child: const Text('Details'))]) ]));
  }

  Future<void> _details(BuildContext context) async {
    await showModalBottomSheet<void>(context: context, showDragHandle: true, backgroundColor: Colors.white, builder: (sheetContext) => SafeArea(child: Padding(padding: const EdgeInsets.fromLTRB(20, 10, 20, 24), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${job['vendorName'] ?? 'Vendor'}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)), const SizedBox(height: 13), _RouteLine(icon: Icons.store_mall_directory_outlined, label: 'Pickup', value: '${job['pickupAddress'] ?? '-'}'), const SizedBox(height: 7), _RouteLine(icon: Icons.home_outlined, label: 'Drop', value: '${job['dropAddress'] ?? '-'}'), const SizedBox(height: 7), _RouteLine(icon: Icons.route_outlined, label: 'Distance', value: job['distanceKm'] == null ? 'Nearby' : '${job['distanceKm']} km'), const SizedBox(height: 16), SizedBox(width: double.infinity, child: FilledButton(onPressed: () { Navigator.pop(sheetContext); onAccept(); }, child: const Text('Accept job')))]))));
  }
}

class _RouteLine extends StatelessWidget {
  const _RouteLine({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Row(children: [Icon(icon, color: _green, size: 17), const SizedBox(width: 8), Text('$label: ', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 10.5)), Expanded(child: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: _muted, fontSize: 10.5)))]);
}

class JobsScreen extends StatelessWidget {
  const JobsScreen({required this.jobs, required this.onRefresh, required this.onAccept, super.key});
  final List<Map<String, dynamic>> jobs;
  final Future<void> Function() onRefresh;
  final Future<void> Function(String) onAccept;
  @override
  Widget build(BuildContext context) => RefreshIndicator(onRefresh: onRefresh, child: ListView(padding: const EdgeInsets.fromLTRB(18, 18, 18, 30), children: [const Text('Available jobs', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)), const SizedBox(height: 5), const Text('Choose a nearby route that fits your mode.', style: TextStyle(color: _muted)), const SizedBox(height: 14), Wrap(spacing: 7, runSpacing: 7, children: const [_Chip('Nearby', true), _Chip('Walking', false), _Chip('Bicycle', false), _Chip('Two-wheeler', false)]), const SizedBox(height: 15), ...jobs.map((j) => DeliveryJobCard(job: j, onAccept: () => onAccept('${j['id']}'))) ]));
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, this.active);
  final String label;
  final bool active;
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8), decoration: BoxDecoration(color: active ? _green : Colors.white, borderRadius: BorderRadius.circular(30), border: Border.all(color: active ? _green : _line)), child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: active ? Colors.white : _muted)));
}

class EarningsScreen extends StatelessWidget {
  const EarningsScreen({required this.data, super.key});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final summary = Map<String, dynamic>.from(data['summary'] ?? {});
    final transactions = data['transactions'] is List ? data['transactions'] as List : const [];

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 30),
      children: [
        const Text('Earnings', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
        const SizedBox(height: 5),
        const Text('Track what you earned and what is pending.', style: TextStyle(color: _muted)),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(child: _MoneyCard(title: 'Today', paise: summary['todayPaise'] ?? 144000)),
            const SizedBox(width: 9),
            Expanded(child: _MoneyCard(title: 'This week', paise: summary['thisWeekPaise'] ?? 842000)),
          ],
        ),
        const SizedBox(height: 10),
        _MoneyCard(title: 'Pending payout', paise: summary['pendingPayoutPaise'] ?? 386500, wide: true),
        const SizedBox(height: 20),
        const Text('Recent deliveries', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
        const SizedBox(height: 10),
        ...transactions.map((raw) {
          final item = Map<String, dynamic>.from(raw as Map);
          final value = ((item['earningPaise'] ?? 500) as num) / 100;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: _line),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(color: _mint, borderRadius: BorderRadius.circular(11)),
                  child: const Icon(Icons.check_rounded, color: _green, size: 18),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item['orderId']?.toString() ?? 'Order', style: const TextStyle(fontWeight: FontWeight.w800)),
                      Text(item['status']?.toString() ?? 'EARNED', style: const TextStyle(fontSize: 10, color: _muted)),
                    ],
                  ),
                ),
                Text('₹${value.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w900)),
              ],
            ),
          );
        }),
      ],
    );
  }
}

class _MoneyCard extends StatelessWidget {
  const _MoneyCard({required this.title, required this.paise, this.wide = false});
  final String title;
  final dynamic paise;
  final bool wide;
  @override
  Widget build(BuildContext context) => Container(width: wide ? double.infinity : null, padding: const EdgeInsets.all(17), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(19), border: Border.all(color: _line)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontSize: 10, color: _muted)), const SizedBox(height: 6), Text('₹${(((paise ?? 0) as num) / 100).toStringAsFixed(0)}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900))]));
}

class DeliveryProfile extends StatelessWidget {
  const DeliveryProfile({required this.profile, super.key});

  final Map<String, dynamic> profile;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 30),
      children: [
        const Text('Profile', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
        const SizedBox(height: 15),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFF075C3E), Color(0xFF0B7A53)]),
            borderRadius: BorderRadius.circular(24),
          ),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: .14), borderRadius: BorderRadius.circular(18)),
                child: Image.asset('assets/branding/AasPass-icon.png'),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(profile['name']?.toString() ?? 'AasPass Delivery Partner', style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w900)),
                    Text('Mode: ${profile['mode'] ?? 'BICYCLE'}', style: const TextStyle(color: Colors.white70, fontSize: 10.5)),
                    Text('KYC: ${profile['kycStatus'] ?? profile['kyc_status'] ?? 'VERIFIED'}', style: const TextStyle(color: Colors.white70, fontSize: 10.5)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 13),
        const _ProfileTile(icon: Icons.verified_user_outlined, title: 'Safety & verification', subtitle: 'Keep KYC and delivery proof ready.'),
        const _ProfileTile(icon: Icons.location_on_outlined, title: 'Location access', subtitle: 'Used for nearby job matching while online.'),
        const _ProfileTile(icon: Icons.support_agent_outlined, title: 'AasPass Support', subtitle: 'Help with active deliveries or payouts.'),
      ],
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Container(margin: const EdgeInsets.only(bottom: 9), padding: const EdgeInsets.all(15), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(17), border: Border.all(color: _line)), child: Row(children: [Container(width: 40, height: 40, decoration: BoxDecoration(color: _mint, borderRadius: BorderRadius.circular(13)), child: Icon(icon, color: _green, size: 18)), const SizedBox(width: 10), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w800)), const SizedBox(height: 2), Text(subtitle, style: const TextStyle(fontSize: 10.5, color: _muted, height: 1.3))])), const Icon(Icons.chevron_right_rounded, color: _muted)]));
}

