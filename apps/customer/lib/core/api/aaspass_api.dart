import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class AasPassApiException implements Exception {
  const AasPassApiException({required this.message, this.statusCode, this.uri});

  final String message;
  final int? statusCode;
  final Uri? uri;

  @override
  String toString() => message;
}

class AasPassApi {
  AasPassApi._();
  static final instance = AasPassApi._();
  // Override with --dart-define=AASPASS_API_BASE_URL=... for a LAN,
  // staging, or production backend. The defaults cover the two most common
  // local development targets: Android emulator and desktop.
  static String get baseUrl => const String.fromEnvironment(
        'AASPASS_API_BASE_URL',
        defaultValue: '',
      ).trim().isNotEmpty
      ? const String.fromEnvironment('AASPASS_API_BASE_URL').trim()
      : (defaultTargetPlatform == TargetPlatform.android
          ? 'http://10.0.2.2:4100/api/v1'
          : 'http://127.0.0.1:4100/api/v1');

  Future<Map<String, String>> _headers() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('aaspass_access_token');
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Future<dynamic> get(String path) async {
    final response = await http
        .get(Uri.parse('$baseUrl$path'), headers: await _headers())
        .timeout(const Duration(seconds: 12));
    return _handle(response);
  }

  Future<dynamic> post(String path, Map<String, dynamic> body,
      {Map<String, String>? headers}) async {
    final requestHeaders = await _headers();
    if (headers != null) requestHeaders.addAll(headers);
    final response = await http
        .post(Uri.parse('$baseUrl$path'),
            headers: requestHeaders, body: jsonEncode(body))
        .timeout(const Duration(seconds: 15));
    return _handle(response);
  }

  Future<dynamic> put(String path, Map<String, dynamic> body) async {
    final response = await http
        .put(Uri.parse('$baseUrl$path'),
            headers: await _headers(), body: jsonEncode(body))
        .timeout(const Duration(seconds: 12));
    return _handle(response);
  }

  Future<dynamic> patch(String path, Map<String, dynamic> body) async {
    final response = await http
        .patch(Uri.parse('$baseUrl$path'),
            headers: await _headers(), body: jsonEncode(body))
        .timeout(const Duration(seconds: 12));
    return _handle(response);
  }


  Future<dynamic> _delete(String path) async {
    final response = await http.delete(Uri.parse('$baseUrl$path'), headers: await _headers()).timeout(const Duration(seconds: 12));
    return _handle(response);
  }

  dynamic _handle(http.Response response) {
    if (response.statusCode >= 400) {
      String detail = 'Request failed with HTTP ${response.statusCode}.';
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map && decoded['message'] is String) {
          detail = decoded['message'] as String;
        } else if (decoded is Map && decoded['error'] is String) {
          detail = decoded['error'] as String;
        }
      } catch (_) {
        if (response.body.trim().isNotEmpty) detail = response.body.trim();
      }
      throw AasPassApiException(
        message: 'AasPass server error (${response.statusCode}): $detail',
        statusCode: response.statusCode,
        uri: response.request?.url,
      );
    }
    return response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> loginDev({required String phone, required String otp, String name = 'AasPass User'}) async {
    final data = Map<String, dynamic>.from(await post('/auth/dev/login', {
      'phone': phone.startsWith('+91') ? phone : '+91$phone',
      'otp': otp,
      'role': 'CUSTOMER',
      'name': name,
    }));
    final prefs = await SharedPreferences.getInstance();
    if (data['accessToken'] is String) {
      await prefs.setString('aaspass_access_token', data['accessToken'] as String);
    }
    final customer = data['customer'];
    if (customer is Map && customer['customerCode'] is String) {
      await prefs.setString('aaspass_customer_code', customer['customerCode'] as String);
    }
    return data;
  }

  Future<List<Map<String, dynamic>>> categories() async {
    final data = Map<String, dynamic>.from(await get('/customer/categories'));
    return _maps(data['categories']);
  }

  Future<List<Map<String, dynamic>>> vendors({double? latitude, double? longitude, String? query}) async {
    final queryParts = <String>[];
    if (latitude != null) queryParts.add('latitude=$latitude');
    if (longitude != null) queryParts.add('longitude=$longitude');
    if (query != null && query.isNotEmpty) queryParts.add('q=${Uri.encodeQueryComponent(query)}');
    final suffix = queryParts.isEmpty ? '' : '?${queryParts.join('&')}';
    final data = Map<String, dynamic>.from(await get('/customer/vendors$suffix'));
    return _maps(data['vendors']);
  }

  Future<List<Map<String, dynamic>>> vendorProducts(String vendorId, {String? category, String? query}) async {
    final parts = <String>[];
    if (category != null && category.isNotEmpty) parts.add('category=${Uri.encodeQueryComponent(category)}');
    if (query != null && query.isNotEmpty) parts.add('q=${Uri.encodeQueryComponent(query)}');
    final suffix = parts.isEmpty ? '' : '?${parts.join('&')}';
    final data = Map<String, dynamic>.from(await get('/customer/vendors/$vendorId/products$suffix'));
    return _maps(data['products']);
  }

  Future<dynamic> serviceability(double latitude, double longitude) => post('/customer/serviceability', {'latitude': latitude, 'longitude': longitude});

  Future<List<Map<String, dynamic>>> notifications() async {
    final data = Map<String, dynamic>.from(await get('/integrations/notifications'));
    return _maps(data['notifications']);
  }

  Future<Map<String, dynamic>> profile() async {
    final data = Map<String, dynamic>.from(await get('/customer/profile'));
    return Map<String, dynamic>.from(data['profile'] ?? data);
  }

  Future<List<Map<String, dynamic>>> orders() async {
    final data = Map<String, dynamic>.from(await get('/customer/orders'));
    return _maps(data['orders']);
  }

  Future<Map<String, dynamic>> personalizedFeed() async => Map<String, dynamic>.from(await get('/customer/personalized-feed'));
  Future<List<Map<String, dynamic>>> buyAgain() async { final data = Map<String, dynamic>.from(await get('/customer/buy-again')); return _maps(data['items']); }
  Future<Map<String, dynamic>> reorderOrder(String id) async => Map<String, dynamic>.from(await post('/customer/orders/$id/reorder', {}));

  Future<dynamic> order(String id) => get('/customer/orders/$id');
  Future<dynamic> tracking(String id) async {
    final data = Map<String, dynamic>.from(await get('/customer/orders/$id/tracking'));
    return data;
  }

  Future<dynamic> createOrder(Map<String, dynamic> body, {required String idempotencyKey}) =>
      post('/customer/orders', body, headers: {'Idempotency-Key': idempotencyKey});

  Future<List<Map<String, dynamic>>> addresses() async {
    final data = Map<String, dynamic>.from(await get('/customer/addresses'));
    return _maps(data['addresses']);
  }

  Future<Map<String, dynamic>> createAddress(Map<String, dynamic> body) async {
    final data = Map<String, dynamic>.from(await post('/customer/addresses', body));
    return Map<String, dynamic>.from(data['address'] ?? data);
  }

  Future<dynamic> syncCart({required String vendorId, required List<Map<String, dynamic>> items}) =>
      put('/customer/cart', {'vendorId': vendorId, 'items': items});

  Future<Map<String, dynamic>> cart() async => Map<String, dynamic>.from(await get('/customer/cart'));

  Future<Map<String, dynamic>> wallet() async => Map<String, dynamic>.from(await get('/commerce/wallet'));

  // Customer account features. These methods intentionally map to the shared
  // /account backend so the profile screens never need a second API client.
  Future<List<Map<String, dynamic>>> wishlist() async {
    final data = Map<String, dynamic>.from(await get('/account/wishlist'));
    return _maps(data['items']);
  }

  Future<Map<String, dynamic>> addWishlist(String productId) async =>
      Map<String, dynamic>.from(await post('/account/wishlist/$productId', {}));

  Future<void> removeWishlist(String productId) async {
    await _delete('/account/wishlist/$productId');
  }

  Future<List<Map<String, dynamic>>> shoppingLists() async {
    final data = Map<String, dynamic>.from(await get('/account/shopping-lists'));
    return _maps(data['lists']);
  }

  Future<Map<String, dynamic>> createShoppingList(String name) async =>
      Map<String, dynamic>.from(await post('/account/shopping-lists', {'name': name}));

  Future<void> deleteShoppingList(String id) async {
    await _delete('/account/shopping-lists/$id');
  }

  Future<Map<String, dynamic>> reviews() async =>
      Map<String, dynamic>.from(await get('/account/reviews'));

  Future<Map<String, dynamic>> saveReview({
    required String orderId,
    required String productId,
    required int rating,
    String? reviewText,
  }) async => Map<String, dynamic>.from(await post('/account/reviews', {
        'orderId': orderId,
        'productId': productId,
        'rating': rating,
        'reviewText': reviewText,
      }));

  Future<List<Map<String, dynamic>>> savedPayments() async {
    final data = Map<String, dynamic>.from(await get('/account/saved-payments'));
    return _maps(data['methods']);
  }

  Future<Map<String, dynamic>> giftCards() async =>
      Map<String, dynamic>.from(await get('/account/gift-cards'));

  Future<Map<String, dynamic>> redeemGiftCard({
    required String code,
    required String idempotencyKey,
  }) async => Map<String, dynamic>.from(await post('/account/gift-cards/redeem', {
        'code': code,
        'idempotencyKey': idempotencyKey,
      }));

  Future<List<Map<String, dynamic>>> securitySessions() async {
    final data = Map<String, dynamic>.from(await get('/account/security/sessions'));
    return _maps(data['sessions']);
  }

  Future<Map<String, dynamic>> revokeOtherSessions() async =>
      Map<String, dynamic>.from(await post('/account/security/revoke-other-sessions', {}));
  Future<Map<String, dynamic>> loyalty() async => Map<String, dynamic>.from(await get('/growth/loyalty'));
  Future<Map<String, dynamic>> referral() async => Map<String, dynamic>.from(await get('/growth/referral'));
  Future<List<Map<String,dynamic>>> membershipPlans() async { final d=Map<String,dynamic>.from(await get('/growth/membership-plans')); return _maps(d['plans']); }
  Future<Map<String,dynamic>> membership() async => Map<String,dynamic>.from(await get('/growth/membership'));
  Future<Map<String,dynamic>> startMembership({required String planId,String billingCycle='MONTHLY'}) async => Map<String,dynamic>.from(await post('/growth/membership/start', {'planId':planId,'billingCycle':billingCycle}));

  Future<Map<String, dynamic>> applyReferral(String code) async => Map<String, dynamic>.from(await post('/growth/referral/apply', {'code': code}));
  Future<Map<String, dynamic>> redeemLoyalty({required int points, required String idempotencyKey}) async => Map<String, dynamic>.from(await post('/growth/loyalty/redeem-to-wallet', {'points': points, 'idempotencyKey': idempotencyKey}));
  Future<List<Map<String, dynamic>>> promotions() async { final data=Map<String,dynamic>.from(await get('/commerce/promotions')); return _maps(data['promotions']); }
  Future<Map<String,dynamic>> validatePromotion(String code,int orderSubtotalPaise) async => Map<String,dynamic>.from(await post('/commerce/promotions/validate', {'code':code,'orderSubtotalPaise':orderSubtotalPaise}));
  Future<Map<String,dynamic>> checkoutQuote({required String vendorId,required String addressId,String? promotionCode,bool useWallet=false}) async => Map<String,dynamic>.from(await post('/customer/checkout/quote', {'vendorId':vendorId,'addressId':addressId,'promotionCode':promotionCode,'useWallet':useWallet}));

  Future<Map<String, dynamic>> paymentSession(String orderId) async {
    final data = Map<String, dynamic>.from(await post('/integrations/payments/session', {
      'orderId': orderId,
      'returnUrl': 'aaspass://payment-return',
      'notifyUrl': '$baseUrl/integrations/payments/webhook',
    }));
    return data;
  }

  Future<Map<String, dynamic>> paymentStatus(String orderId) async =>
      Map<String, dynamic>.from(await get('/integrations/payments/$orderId/status'));

  List<Map<String, dynamic>> _maps(dynamic value) {
    if (value is! List) return <Map<String, dynamic>>[];
    return value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }
}
