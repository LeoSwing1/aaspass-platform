import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api/aaspass_api.dart';
import '../../core/theme/app_theme.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({required this.onSignedIn, super.key});
  final VoidCallback onSignedIn;
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final phone = TextEditingController();
  final otp = TextEditingController();
  bool otpSent = false;
  bool busy = false;

  @override
  void dispose() { phone.dispose(); otp.dispose(); super.dispose(); }

  Future<void> submit() async {
    final number = phone.text.replaceAll(RegExp(r'\D'), '');
    if (number.length != 10) { _snack('Enter a valid 10-digit mobile number'); return; }
    if (!otpSent) { setState(() => otpSent = true); _snack('Development OTP: 270303'); return; }
    if (otp.text.trim() != '270303') { _snack('Incorrect development OTP'); return; }
    setState(() => busy = true);
    try {
      final data = await AasPassApi.instance.loginDev(phone: number, otp: otp.text.trim());
      final prefs = await SharedPreferences.getInstance();
      final customer = data['customer'];
      if (customer is Map && customer['customerCode'] is String) await prefs.setString('aaspass_customer_code', customer['customerCode'] as String);
      if (mounted) widget.onSignedIn();
    } on AasPassApiException catch (error) {
      if (mounted) _snack(error.message);
    } catch (error) {
      if (mounted) {
        final message = error.toString();
        _snack(
          message.contains('SocketException') || message.contains('TimeoutException')
              ? 'AasPass server is not reachable. Start the backend on port 4100 or build with the correct AASPASS_API_BASE_URL.'
              : 'AasPass connection failed. ${message.replaceFirst('Exception: ', '')}',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _snack(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(child: Image.asset('assets/branding/AasPass-LOGO.png', height: 54)),
                  const SizedBox(height: 46),
                  const Text('Welcome to AasPass', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  const Text('Your neighbourhood. Your shops. Your people.', style: TextStyle(fontSize: 16, color: AppTokens.muted)),
                  const SizedBox(height: 28),
                  TextField(controller: phone, keyboardType: TextInputType.phone, maxLength: 10, decoration: const InputDecoration(prefixText: '+91  ', labelText: 'Mobile number', counterText: '')),
                  if (otpSent) ...[
                    const SizedBox(height: 14),
                    TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: 'OTP', helperText: 'Development OTP: 270303', counterText: '')),
                  ],
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: busy ? null : submit,
                      child: busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : Text(otpSent ? 'Verify & continue' : 'Send OTP'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Center(child: Text('By continuing, you agree to AasPass terms and privacy policy.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppTokens.muted))),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
