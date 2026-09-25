import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app_controller.dart';
import '../../core/api/aaspass_api.dart';
import '../../core/services/location_service.dart';
import '../../core/theme/app_theme.dart';
import '../addresses/addresses_screen.dart';
import '../growth/growth_screen.dart';
import '../help/help_screen.dart';
import '../notifications/notifications_screen.dart';
import '../orders/orders_screen.dart';
import 'account_features.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({required this.cart, required this.location, this.onLogout, super.key});

  final CartController cart;
  final LocationService location;
  final VoidCallback? onLogout;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  String code = '—';
  String name = 'AasPass Customer';
  String phone = '';
  String email = '';
  bool loading = true;
  bool loggingOut = false;
  int walletPaise = 0;
  List<Map<String, dynamic>> walletTransactions = const [];

  @override
  void initState() {
    super.initState();
    _loadCode();
    _loadProfile();
    _loadWallet();
  }

  Future<void> _loadCode() async {
    final prefs = await SharedPreferences.getInstance();
    if (mounted) setState(() => code = prefs.getString('aaspass_customer_code') ?? code);
  }

  Future<void> _loadProfile() async {
    try {
      final profile = await AasPassApi.instance.profile();
      if (!mounted) return;
      setState(() {
        name = '${profile['name'] ?? name}';
        code = '${profile['customer_code'] ?? profile['customerCode'] ?? code}';
        phone = '${profile['phone'] ?? ''}';
        email = '${profile['email'] ?? ''}';
        loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _loadWallet() async {
    try {
      final data = await AasPassApi.instance.wallet();
      final rawWallet = data['wallet'];
      final rawTransactions = data['transactions'];
      if (!mounted) return;
      setState(() {
        walletPaise = int.tryParse('${rawWallet is Map ? rawWallet['balance_paise'] : 0}') ?? 0;
        walletTransactions = rawTransactions is List
            ? rawTransactions.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).take(5).toList()
            : const [];
      });
    } catch (_) {
      // Wallet remains at a safe empty state.
    }
  }

  Future<void> _editProfile() async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => EditProfileScreen(name: name, email: email)),
    );
    if (changed == true) await _loadProfile();
  }

  Future<void> _logout() async {
    if (loggingOut) return;
    setState(() => loggingOut = true);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('aaspass_access_token');
    await prefs.remove('aaspass_customer_code');
    await prefs.remove('aaspass_last_cart_vendor');
    if (!mounted) return;
    setState(() => loggingOut = false);
    widget.onLogout?.call();
    if (widget.onLogout == null && Navigator.canPop(context)) {
      Navigator.pop(context);
    }
  }

  Future<void> _openLocationSettings() async {
    final result = await widget.location.locate();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.label)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        titleSpacing: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, size: 28),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text('My Account', style: TextStyle(fontSize: 25, fontWeight: FontWeight.w900, letterSpacing: -.5)),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await _loadProfile();
          await _loadWallet();
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(24, 14, 24, 34),
          children: [
            _accountCard(),
            const SizedBox(height: 28),
            _quickActions(),
            const SizedBox(height: 18),
            const Divider(height: 1, color: Color(0xFFE3E3E3)),
            const SizedBox(height: 4),
            _accountTile(Icons.favorite_border_rounded, 'My Wishlist', () => Navigator.push(context, MaterialPageRoute(builder: (_) => WishlistScreen(cart: widget.cart)))),
            _accountTile(Icons.edit_note_rounded, 'Shopping lists', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ShoppingListsScreen()))),
            _accountTile(Icons.credit_card_outlined, 'Saved Payments', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SavedPaymentsScreen()))),
            _accountTile(Icons.star_border_rounded, 'Ratings & Reviews', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReviewsScreen()))),
            _accountTile(Icons.auto_awesome_outlined, 'AasPass Rewards', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GrowthScreen()))),
            _accountTile(Icons.workspace_premium_outlined, 'AasPass Plus', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GrowthScreen()))),
            _accountTile(Icons.support_agent_rounded, 'Support & FAQs', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HelpScreen()))),
            _accountTile(Icons.card_giftcard_outlined, 'My Gift Cards', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GiftCardsScreen()))),
            _accountTile(Icons.notifications_none_rounded, 'Notifications', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen()))),
            _accountTile(Icons.tune_rounded, 'Notification preferences', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationPreferencesScreen()))),
            _accountTile(Icons.location_searching_rounded, 'Location settings', _openLocationSettings),
            _accountTile(Icons.shield_outlined, 'Privacy & security', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SecurityScreen()))),
            const SizedBox(height: 26),
            const Divider(height: 1, color: Color(0xFFE3E3E3)),
            const SizedBox(height: 20),
            _footerLink('Terms & Conditions'),
            _footerLink('Privacy Policy'),
            const SizedBox(height: 18),
            Center(
              child: TextButton.icon(
                onPressed: loggingOut ? null : _logout,
                icon: loggingOut
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppTokens.green))
                    : const Icon(Icons.logout_rounded),
                label: const Text('Log Out', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                style: TextButton.styleFrom(foregroundColor: AppTokens.green),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _social(Icons.camera_alt_rounded),
                _social(Icons.close_rounded),
                _social(Icons.facebook),
                _social(Icons.play_arrow_rounded),
              ],
            ),
            const SizedBox(height: 26),
            Center(child: Image.asset('assets/branding/AasPass-LOGO.png', height: 36, fit: BoxFit.contain)),
            const SizedBox(height: 10),
            const Center(child: Text('AasPass', style: TextStyle(fontSize: 12, color: AppTokens.muted, fontWeight: FontWeight.w700))),
            const SizedBox(height: 8),
            const Center(child: Text('v0.12.0', style: TextStyle(fontSize: 12, color: AppTokens.muted))),
          ],
        ),
      ),
    );
  }

  Widget _accountCard() {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: const Color(0xFFD9D9D9))),
      child: Stack(
        children: [
          Positioned.fill(child: CustomPaint(painter: _PatternPainter())),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 12, 18),
            child: Column(
              children: [
                Row(
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, border: Border.all(color: const Color(0xFF252525), width: 3)),
                      child: const Icon(Icons.person_rounded, size: 34, color: Color(0xFF252525)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w900, letterSpacing: -.6))),
                    IconButton(onPressed: loading ? null : _editProfile, icon: const Icon(Icons.edit_outlined, color: AppTokens.green, size: 25)),
                  ],
                ),
                const SizedBox(height: 13),
                _contactLine(Icons.phone_iphone_rounded, phone.isEmpty ? 'Mobile number not available' : phone),
                const SizedBox(height: 8),
                _contactLine(Icons.mail_outline_rounded, email.isEmpty ? 'Email not added' : email),
                const SizedBox(height: 4),
                Align(alignment: Alignment.centerLeft, child: Text(code == '—' ? 'Customer ID pending' : code, style: const TextStyle(fontSize: 10, color: AppTokens.green, fontWeight: FontWeight.w800))),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _contactLine(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 21, color: const Color(0xFF7A7A7A)),
        const SizedBox(width: 12),
        Expanded(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, color: Color(0xFF777777), fontWeight: FontWeight.w500))),
      ],
    );
  }

  Widget _quickActions() {
    return Row(
      children: [
        Expanded(child: _quickAction(Icons.receipt_long_rounded, 'Orders', () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrdersScreen(cart: widget.cart))))),
        Expanded(child: _quickAction(Icons.account_balance_wallet_outlined, 'Wallet', () => Navigator.push(context, MaterialPageRoute(builder: (_) => WalletScreen(balancePaise: walletPaise, transactions: walletTransactions))))),
        Expanded(child: _quickAction(Icons.contact_page_outlined, 'Address', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AddressesScreen())))),
      ],
    );
  }

  Widget _quickAction(IconData icon, String label, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: Column(
        children: [
          Container(width: 68, height: 68, decoration: const BoxDecoration(color: Color(0xFFF3F3F3), shape: BoxShape.circle), child: Icon(icon, size: 32, color: const Color(0xFF202020))),
          const SizedBox(height: 9),
          Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }

  Widget _accountTile(IconData icon, String title, VoidCallback onTap) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
      minVerticalPadding: 10,
      leading: Icon(icon, size: 29, color: const Color(0xFF252525)),
      title: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
      trailing: const Icon(Icons.chevron_right_rounded, size: 29, color: Color(0xFF7A7A7A)),
      onTap: onTap,
    );
  }

  Widget _footerLink(String text) {
    return Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Text(text, style: const TextStyle(fontSize: 15, color: Color(0xFF777777), fontWeight: FontWeight.w500)));
  }

  Widget _social(IconData icon) {
    return Padding(padding: const EdgeInsets.symmetric(horizontal: 13), child: Icon(icon, size: 27, color: const Color(0xFF222222)));
  }
}

class WalletScreen extends StatelessWidget {
  const WalletScreen({required this.balancePaise, required this.transactions, super.key});

  final int balancePaise;
  final List<Map<String, dynamic>> transactions;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AasPass Wallet', style: TextStyle(fontWeight: FontWeight.w900))),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(color: AppTokens.green, borderRadius: BorderRadius.circular(22)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Available balance', style: TextStyle(color: Colors.white70)),
                const SizedBox(height: 7),
                Text('₹${(balancePaise / 100).toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontSize: 31, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
          const SizedBox(height: 22),
          const Text('Recent transactions', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          if (transactions.isEmpty)
            const Padding(padding: EdgeInsets.all(22), child: Text('No wallet transactions yet.', style: TextStyle(color: AppTokens.muted)))
          else
            ...transactions.map(
              (item) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const CircleAvatar(backgroundColor: AppTokens.mint, child: Icon(Icons.account_balance_wallet_outlined, color: AppTokens.green)),
                title: Text('${item['transaction_type'] ?? 'Wallet transaction'}', style: const TextStyle(fontWeight: FontWeight.w800)),
                trailing: Text(
                  '${item['direction'] == 'DEBIT' ? '-' : '+'}₹${((int.tryParse('${item['amount_paise'] ?? 0}') ?? 0) / 100).toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({required this.name, required this.email, super.key});
  final String name;
  final String email;

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  late final TextEditingController nameController;
  late final TextEditingController emailController;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    nameController = TextEditingController(text: widget.name);
    emailController = TextEditingController(text: widget.email);
  }

  @override
  void dispose() {
    nameController.dispose();
    emailController.dispose();
    super.dispose();
  }

  Future<void> save() async {
    final name = nameController.text.trim();
    if (name.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter your name')));
      return;
    }
    setState(() => busy = true);
    try {
      await AasPassApi.instance.patch('/customer/profile', {
        'name': name,
        'email': emailController.text.trim().isEmpty ? null : emailController.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not update your profile. Please try again.')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit profile', style: TextStyle(fontWeight: FontWeight.w900))),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          TextField(controller: nameController, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Full name')),
          const SizedBox(height: 14),
          TextField(controller: emailController, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email address')),
          const SizedBox(height: 22),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: busy ? null : save,
              child: busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Save changes'),
            ),
          ),
        ],
      ),
    );
  }
}

class NotificationPreferencesScreen extends StatefulWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  State<NotificationPreferencesScreen> createState() => _NotificationPreferencesScreenState();
}

class _NotificationPreferencesScreenState extends State<NotificationPreferencesScreen> {
  Map<String, dynamic> prefs = {};
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await AasPassApi.instance.get('/customer/notification-preferences');
      final raw = data['preferences'];
      if (mounted) setState(() => prefs = raw is Map ? Map<String, dynamic>.from(raw) : {});
    } catch (_) {
      // Default switches remain off until the backend returns saved preferences.
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _toggle(String key, bool value) async {
    final previous = prefs[key] == true;
    setState(() => prefs[key] = value);
    try {
      await AasPassApi.instance.patch('/customer/notification-preferences', {key: value});
    } catch (_) {
      if (mounted) setState(() => prefs[key] = previous);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    const rows = <String, String>{
      'order_updates': 'Order updates',
      'delivery_updates': 'Delivery updates',
      'payment_updates': 'Payment updates',
      'support_updates': 'Support updates',
      'promotions': 'Promotions',
      'product_offers': 'Product offers',
      'push_enabled': 'Push notifications',
      'whatsapp_enabled': 'WhatsApp',
      'sms_enabled': 'SMS',
      'email_enabled': 'Email',
    };
    return Scaffold(
      appBar: AppBar(title: const Text('Notification preferences', style: TextStyle(fontWeight: FontWeight.w900))),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: rows.entries
            .map(
              (entry) => SwitchListTile(
                title: Text(entry.value, style: const TextStyle(fontWeight: FontWeight.w700)),
                value: prefs[entry.key] == true,
                onChanged: (value) => _toggle(entry.key, value),
                activeThumbColor: AppTokens.green,
              ),
            )
            .toList(),
      ),
    );
  }
}

class _PatternPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..color = const Color(0x240B7A53);
    for (double x = -30; x < size.width + 50; x += 48) {
      for (double y = -20; y < size.height + 40; y += 48) {
        final rect = RRect.fromRectAndRadius(Rect.fromLTWH(x, y, 36, 36), const Radius.circular(15));
        canvas.drawRRect(rect, paint);
        canvas.drawLine(Offset(x + 18, y), Offset(x + 18, y + 36), paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
