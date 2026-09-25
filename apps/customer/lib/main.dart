import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app_controller.dart';
import 'core/api/aaspass_api.dart';
import 'core/services/location_service.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_screen.dart';
import 'features/home/home_screen.dart';
import 'features/categories/categories_screen.dart';
import 'features/top_picks/top_picks_screen.dart';
import 'features/profile/profile_screen.dart';
import 'features/splash/splash_screen.dart';
import 'features/onboarding/onboarding_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AasPassCustomerApp());
}

class AasPassCustomerApp extends StatefulWidget {
  const AasPassCustomerApp({super.key});
  @override
  State<AasPassCustomerApp> createState() => _AasPassCustomerAppState();
}

class _AasPassCustomerAppState extends State<AasPassCustomerApp> with WidgetsBindingObserver {
  final cart = CartController();
  final location = LocationService();
  bool showResumeSplash = true;
  Timer? splashTimer;
  DateTime? backgroundedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    cart.restore();
    _showSplash(const Duration(milliseconds: 1350));
  }

  void _showSplash(Duration duration) {
    splashTimer?.cancel();
    if (mounted) setState(() => showResumeSplash = true);
    splashTimer = Timer(duration, () {
      if (mounted) setState(() => showResumeSplash = false);
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) {
      backgroundedAt ??= DateTime.now();
    }
    if (state == AppLifecycleState.resumed) {
      final start = backgroundedAt;
      backgroundedAt = null;
      if (start != null && DateTime.now().difference(start) >= const Duration(seconds: 2)) {
        _showSplash(const Duration(milliseconds: 900));
      }
    }
  }

  @override
  void dispose() {
    splashTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    cart.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: cart,
      builder: (_, child) => MaterialApp(
        title: 'AasPass',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        home: _AppEntry(cart: cart, location: location, api: AasPassApi.instance),
        builder: (context, child) => Stack(
          fit: StackFit.expand,
          children: [
            if (child case final childWidget?) childWidget,
            if (showResumeSplash) const IgnorePointer(child: AasPassSplashOverlay()),
          ],
        ),
      ),
    );
  }
}

class _AppEntry extends StatefulWidget {
  const _AppEntry({required this.cart, required this.location, required this.api});
  final CartController cart;
  final LocationService location;
  final AasPassApi api;
  @override
  State<_AppEntry> createState() => _AppEntryState();
}

class _AppEntryState extends State<_AppEntry> {
  bool onboardingDone = false;
  bool loading = true;
  bool signedIn = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferencesShim.instance();
    if (!mounted) return;
    setState(() {
      onboardingDone = prefs.onboardingDone;
      signedIn = prefs.hasToken;
      loading = false;
    });
  }

  void _finishOnboarding() async {
    final prefs = await SharedPreferencesShim.instance();
    await prefs.markOnboardingDone();
    if (mounted) setState(() => onboardingDone = true);
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const AasPassSplashOverlay();
    if (!onboardingDone) return OnboardingScreen(onDone: _finishOnboarding);
    if (!signedIn) {
      return AuthScreen(onSignedIn: () {
        if (mounted) setState(() => signedIn = true);
      });
    }
    return CustomerShell(cart: widget.cart, location: widget.location);
  }
}


class SharedPreferencesShim {
  SharedPreferencesShim._(this._prefs);
  final dynamic _prefs;
  static Future<SharedPreferencesShim> instance() async {
    final prefs = await SharedPreferences.getInstance();
    return SharedPreferencesShim._(prefs);
  }
  bool get onboardingDone => _prefs.getBool('onboarding_done') ?? false;
  bool get hasToken => ((_prefs.getString('aaspass_access_token') ?? '').isNotEmpty);
  Future<void> markOnboardingDone() => _prefs.setBool('onboarding_done', true);
}

class CustomerShell extends StatefulWidget {
  const CustomerShell({required this.cart, required this.location, super.key});
  final CartController cart;
  final LocationService location;
  @override
  State<CustomerShell> createState() => _CustomerShellState();
}

class _CustomerShellState extends State<CustomerShell> {
  int index = 0;
  bool signedIn = true;
  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      HomeScreen(
        cart: widget.cart,
        location: widget.location,
        onOpenAccount: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ProfileScreen(
              cart: widget.cart,
              location: widget.location,
              onLogout: () {
                Navigator.of(context).pop();
                if (mounted) setState(() => signedIn = false);
              },
            ),
          ),
        ),
      ),
      CategoriesScreen(cart: widget.cart),
      TopPicksScreen(cart: widget.cart),
    ];
    if (!signedIn) {
      return AuthScreen(onSignedIn: () { if (mounted) setState(() => signedIn = true); });
    }
    return Scaffold(
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view_rounded), label: 'Categories'),
          NavigationDestination(icon: Icon(Icons.local_offer_outlined), selectedIcon: Icon(Icons.local_offer_rounded), label: 'Top picks'),
        ],
      ),
    );
  }
}
