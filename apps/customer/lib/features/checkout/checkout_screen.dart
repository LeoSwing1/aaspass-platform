import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_cashfree_pg_sdk/api/cferrorresponse/cferrorresponse.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfpayment/cfwebcheckoutpayment.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfpaymentgateway/cfpaymentgatewayservice.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfsession/cfsession.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfenums.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfexceptions.dart';

import '../../app_controller.dart';
import '../../core/api/aaspass_api.dart';
import '../../core/theme/app_theme.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({required this.cart, super.key});
  final CartController cart;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final CFPaymentGatewayService gateway = CFPaymentGatewayService();
  final promo = TextEditingController();
  final address = TextEditingController();
  final city = TextEditingController(text: 'Lucknow');
  final state = TextEditingController(text: 'Uttar Pradesh');
  final postal = TextEditingController(text: '226010');

  String payment = 'UPI';
  String? addressId;
  String? promotionCode;
  String? pendingOrderId;
  int walletBalancePaise = 0;
  int walletAppliedPaise = 0;
  int discountPaise = 0;
  int membershipDiscountPaise = 0;
  double serverDelivery = 0;
  double serverFee = 1;
  double serverGst = .18;
  double serverTotal = 0;
  bool useWallet = false;
  bool quoteBusy = false;
  bool membershipActive = false;
  bool promoBusy = false;
  bool busy = false;
  bool loadingAddress = true;

  @override
  void initState() {
    super.initState();
    _loadAddress();
  }

  @override
  void dispose() {
    promo.dispose();
    address.dispose();
    city.dispose();
    state.dispose();
    postal.dispose();
    super.dispose();
  }

  Future<void> _loadAddress() async {
    try {
      final wallet = await AasPassApi.instance.wallet();
      final rawWallet = wallet['wallet'];
      walletBalancePaise = int.tryParse('${rawWallet is Map ? rawWallet['balance_paise'] : 0}') ?? 0;

      final list = await AasPassApi.instance.addresses();
      if (list.isNotEmpty) {
        final item = list.first;
        addressId = '${item['id']}';
        address.text = '${item['line1'] ?? ''}';
        city.text = '${item['city'] ?? 'Lucknow'}';
        state.text = '${item['state'] ?? 'Uttar Pradesh'}';
        postal.text = '${item['postal_code'] ?? item['postalCode'] ?? '226010'}';
      }

      try {
        final membership = await AasPassApi.instance.membership();
        final raw = membership['membership'];
        membershipActive = raw is Map && '${raw['status']}' == 'ACTIVE';
      } catch (_) {
        membershipActive = false;
      }

      if (addressId != null) await _refreshQuote();
    } catch (_) {
      // The address editor remains available even when the initial fetch fails.
    } finally {
      if (mounted) setState(() => loadingAddress = false);
    }
  }

  Future<void> _refreshQuote() async {
    if (addressId == null || widget.cart.lines.isEmpty) return;
    if (mounted) setState(() => quoteBusy = true);
    try {
      final quote = await AasPassApi.instance.checkoutQuote(
        vendorId: widget.cart.lines.first.product.vendorId,
        addressId: addressId!,
        promotionCode: promotionCode,
        useWallet: useWallet,
      );
      final raw = quote['quote'];
      if (raw is Map && mounted) {
        final deliveryPaise = int.tryParse('${raw['deliveryFeePaise'] ?? 0}') ?? 0;
        final feePaise = int.tryParse('${raw['platformFeePaise'] ?? 0}') ?? 0;
        final gstPaise = int.tryParse('${raw['platformGstPaise'] ?? 0}') ?? 0;
        final payablePaise = int.tryParse('${raw['payablePaise'] ?? 0}') ?? 0;
        setState(() {
          serverDelivery = deliveryPaise / 100;
          serverFee = feePaise / 100;
          serverGst = gstPaise / 100;
          serverTotal = payablePaise / 100;
          walletAppliedPaise = int.tryParse('${raw['walletAppliedPaise'] ?? 0}') ?? 0;
          discountPaise = int.tryParse('${raw['discountPaise'] ?? discountPaise}') ?? discountPaise;
          membershipDiscountPaise = int.tryParse('${raw['membershipDiscountPaise'] ?? 0}') ?? 0;
          membershipActive = raw['membershipId'] != null;
        });
      }
    } catch (_) {
      // Local fallback values are display-only; order creation remains server-authoritative.
    } finally {
      if (mounted) setState(() => quoteBusy = false);
    }
  }

  Future<void> _applyPromo() async {
    final code = promo.text.trim();
    if (code.isEmpty) return;
    setState(() => promoBusy = true);
    try {
      final result = await AasPassApi.instance.validatePromotion(
        code,
        (widget.cart.subtotal * 100).round(),
      );
      promotionCode = '${result['code'] ?? code}';
      discountPaise = int.tryParse('${result['discountPaise'] ?? 0}') ?? 0;
      await _refreshQuote();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Coupon applied: -₹${(discountPaise / 100).toStringAsFixed(2)}')),
        );
      }
    } catch (error) {
      promotionCode = null;
      discountPaise = 0;
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Coupon not applied: $error')));
    } finally {
      if (mounted) setState(() => promoBusy = false);
    }
  }

  Future<String> _ensureAddress() async {
    if (addressId != null) return addressId!;
    if (address.text.trim().length < 3) throw Exception('Please enter your delivery address.');
    final result = await AasPassApi.instance.createAddress({
      'label': 'Home',
      'line1': address.text.trim(),
      'city': city.text.trim(),
      'state': state.text.trim(),
      'postalCode': postal.text.trim(),
      'isDefault': true,
    });
    final id = '${result['id']}';
    if (id.isEmpty) throw Exception('Address was not created.');
    addressId = id;
    return id;
  }

  Future<void> _onPaymentVerify(String providerOrderId) async {
    final orderId = pendingOrderId;
    if (orderId == null) return;
    for (var attempt = 0; attempt < 8; attempt++) {
      try {
        final data = await AasPassApi.instance.paymentStatus(orderId);
        final payments = data['payments'];
        if (payments is List && payments.any((item) {
          if (item is! Map) return false;
          return '${item['payment_status'] ?? item['status']}'.toUpperCase() == 'SUCCESS';
        })) {
          if (mounted) await _showOrderComplete(orderId, paid: true);
          return;
        }
      } catch (_) {
        // Provider confirmation is retried below.
      }
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Payment was submitted. AasPass is waiting for provider confirmation.')),
      );
    }
  }

  void _onPaymentError(CFErrorResponse errorResponse, String data) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Payment not completed: ${errorResponse.getMessage()}')),
      );
    }
  }

  Future<void> _startCashfree(String orderId, String paymentSessionId) async {
    try {
      pendingOrderId = orderId;
      gateway.setCallback(_onPaymentVerify, _onPaymentError);
      final isProduction = const String.fromEnvironment(
        'AASPASS_CASHFREE_ENV',
        defaultValue: 'SANDBOX',
      ).toUpperCase() == 'PRODUCTION';
      final session = CFSessionBuilder()
          .setEnvironment(isProduction ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX)
          .setOrderId(orderId)
          .setPaymentSessionId(paymentSessionId)
          .build();
      final checkout = CFWebCheckoutPaymentBuilder().setSession(session).build();
      gateway.doPayment(checkout);
    } on CFException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Cashfree checkout could not start: ${error.message}')),
        );
      }
    }
  }

  Future<void> _showOrderComplete(String orderId, {required bool paid}) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 78,
                height: 78,
                decoration: BoxDecoration(color: AppTokens.mint, borderRadius: BorderRadius.circular(26)),
                child: Icon(paid ? Icons.check_rounded : Icons.schedule_rounded, size: 44, color: AppTokens.green),
              ),
              const SizedBox(height: 14),
              Text(paid ? 'Payment confirmed' : 'Order placed', style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
              const SizedBox(height: 7),
              Text(
                paid ? 'AasPass has received provider confirmation.' : 'COD order is recorded in the AasPass backend.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppTokens.muted),
              ),
              const SizedBox(height: 8),
              Text('Order $orderId', style: const TextStyle(fontSize: 11, color: AppTokens.muted)),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Done')),
              ),
            ],
          ),
        ),
      ),
    );
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> placeOrder() async {
    if (widget.cart.lines.isEmpty || busy) return;
    setState(() => busy = true);
    try {
      final vendorId = widget.cart.lines.first.product.vendorId;
      final savedAddressId = await _ensureAddress();
      final idempotency = 'cust_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(999999)}';
      final result = await AasPassApi.instance.createOrder(
        {
          'vendorId': vendorId,
          'addressId': savedAddressId,
          'paymentMethod': payment,
          'promotionCode': promotionCode,
          'useWallet': useWallet,
          'idempotencyKey': idempotency,
        },
        idempotencyKey: idempotency,
      );
      final rawOrder = result is Map ? result['order'] ?? result : null;
      if (rawOrder is! Map) throw Exception('AasPass did not return an order.');
      final order = Map<String, dynamic>.from(rawOrder);
      final orderId = '${order['id']}';
      if (orderId.isEmpty) throw Exception('AasPass returned an invalid order.');

      if ('${order['status']}' == 'PAID' || '${order['total_paise']}' == '0') {
        await _showOrderComplete(orderId, paid: true);
      } else if (payment != 'COD') {
        final session = await AasPassApi.instance.paymentSession(orderId);
        final sessionId = '${session['paymentSessionId'] ?? session['payment_session_id']}';
        if (sessionId.isEmpty) throw Exception('Payment session was not created.');
        await _startCashfree(orderId, sessionId);
      } else {
        await _showOrderComplete(orderId, paid: false);
      }
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$error')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final subtotal = widget.cart.subtotal;
    final delivery = serverTotal > 0 ? serverDelivery : (subtotal >= 299 ? 0.0 : 5.0);
    final fee = serverTotal > 0 ? serverFee : 1.0;
    final gst = serverTotal > 0 ? serverGst : .18;
    final discount = discountPaise / 100;
    final wallet = walletAppliedPaise / 100;
    final membershipDiscount = membershipDiscountPaise / 100;
    final total = serverTotal > 0 ? serverTotal : (subtotal - discount - membershipDiscount) + delivery + fee + gst - wallet;

    return Scaffold(
      appBar: AppBar(title: const Text('Secure checkout', style: TextStyle(fontWeight: FontWeight.w900))),
      body: loadingAddress
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 132),
              children: [
                _heading('Delivery address', 'AasPass needs a real saved address for the order'),
                _addressCard(),
                const SizedBox(height: 18),
                _heading('Offers & AasPass Wallet', 'Savings are validated again by the backend at order creation'),
                _offersCard(),
                const SizedBox(height: 18),
                _heading('Payment method', 'Cashfree is started from the server for online methods'),
                _paymentCard(),
                const SizedBox(height: 18),
                _pricingCard(),
                const SizedBox(height: 18),
                _summaryCard(subtotal, delivery, fee, gst, total, discount, membershipDiscount, wallet),
              ],
            ),
      bottomSheet: SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          decoration: const BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Color(0x16000000), blurRadius: 20, offset: Offset(0, -6))]),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Total', style: TextStyle(fontSize: 10, color: AppTokens.muted)),
                    Text('₹${total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
              Expanded(
                child: FilledButton.icon(
                  onPressed: busy || quoteBusy ? null : placeOrder,
                  icon: busy ? const SizedBox(width: 17, height: 17, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.lock_rounded, size: 17),
                  label: Text(busy ? 'Processing…' : 'Place order'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _heading(String title, String subtitle) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
          Text(subtitle, style: const TextStyle(fontSize: 10, color: AppTokens.muted)),
        ],
      ),
    );
  }

  Widget _addressCard() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppTokens.border)),
      child: Column(
        children: [
          TextField(controller: address, maxLines: 2, decoration: const InputDecoration(labelText: 'House / street / landmark', border: InputBorder.none)),
          Row(
            children: [
              Expanded(child: TextField(controller: city, decoration: const InputDecoration(labelText: 'City', border: InputBorder.none))),
              Expanded(child: TextField(controller: postal, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'PIN', border: InputBorder.none))),
            ],
          ),
        ],
      ),
    );
  }

  Widget _offersCard() {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppTokens.border)),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(child: TextField(controller: promo, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Coupon code', prefixIcon: Icon(Icons.local_offer_outlined), border: InputBorder.none))),
              FilledButton(onPressed: promoBusy ? null : _applyPromo, child: Text(promoBusy ? '…' : 'Apply')),
            ],
          ),
          if (membershipActive)
            const Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Text('AasPass Plus benefits applied automatically', style: TextStyle(color: AppTokens.green, fontWeight: FontWeight.w800)),
              ),
            ),
          if (promotionCode != null)
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text('$promotionCode applied • -₹${(discountPaise / 100).toStringAsFixed(2)}', style: const TextStyle(color: AppTokens.green, fontWeight: FontWeight.w800)),
              ),
            ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Use AasPass Wallet', style: TextStyle(fontWeight: FontWeight.w800)),
            subtitle: Text('Balance ₹${(walletBalancePaise / 100).toStringAsFixed(2)}'),
            value: useWallet,
            onChanged: walletBalancePaise == 0
                ? null
                : (value) async {
                    setState(() => useWallet = value);
                    await _refreshQuote();
                  },
            activeThumbColor: AppTokens.green,
          ),
        ],
      ),
    );
  }

  Widget _paymentCard() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTokens.border),
      ),
      child: RadioGroup<String>(
        groupValue: payment,
        onChanged: (value) {
          if (value != null) {
            setState(() => payment = value);
          }
        },
        child: Column(
          children: ['UPI', 'CARD', 'COD'].map((method) {
            final selected = payment == method;
            return RadioListTile<String>(
              contentPadding: const EdgeInsets.symmetric(horizontal: 10),
              title: Text(method, style: const TextStyle(fontWeight: FontWeight.w800)),
              secondary: Icon(
                method == 'UPI'
                    ? Icons.account_balance_wallet_outlined
                    : method == 'CARD'
                        ? Icons.credit_card_outlined
                        : Icons.payments_outlined,
                color: selected ? AppTokens.green : AppTokens.muted,
              ),
              value: method,
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _pricingCard() {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(color: AppTokens.mint, borderRadius: BorderRadius.circular(18)),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [Icon(Icons.verified_outlined, color: AppTokens.green, size: 18), SizedBox(width: 7), Expanded(child: Text('No fake payment success is shown.', style: TextStyle(fontWeight: FontWeight.w800)))]),
          SizedBox(height: 8),
          Text('COD is recorded directly. UPI/Card creates a real Cashfree payment session on the backend and the final state is confirmed by the provider webhook.', style: TextStyle(fontSize: 11, color: AppTokens.muted, height: 1.45)),
        ],
      ),
    );
  }

  Widget _summaryCard(double subtotal, double delivery, double fee, double gst, double total, double discount, double membershipDiscount, double wallet) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppTokens.border)),
      child: Column(
        children: [
          _row('Items', subtotal),
          if (discount > 0) _row('Coupon savings', -discount),
          if (membershipDiscount > 0) _row('AasPass Plus savings', -membershipDiscount),
          _row('Delivery', delivery),
          _row('AasPass platform fee', fee),
          _row('GST on platform fee', gst),
          if (wallet > 0) _row('Wallet used', -wallet),
          const Divider(height: 22),
          _row('Total', total, bold: true),
        ],
      ),
    );
  }

  Widget _row(String label, double amount, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(label, style: TextStyle(fontWeight: bold ? FontWeight.w900 : FontWeight.w600))),
          Text('₹${amount.toStringAsFixed(2)}', style: TextStyle(fontWeight: bold ? FontWeight.w900 : FontWeight.w700, fontSize: bold ? 18 : 13)),
        ],
      ),
    );
  }
}
