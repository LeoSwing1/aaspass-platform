import 'dart:async';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../app_controller.dart';
import '../../models/domain.dart';
import '../theme/app_theme.dart';


class SmartImage extends StatelessWidget {
  const SmartImage(this.source, {this.fit = BoxFit.contain, this.cacheWidth, super.key});
  final String source;
  final BoxFit fit;
  final int? cacheWidth;
  @override Widget build(BuildContext context) {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return Image.network(source, fit: fit, cacheWidth: cacheWidth, errorBuilder: (_, _, _) => const Icon(Icons.image_not_supported_outlined, color: AppTokens.muted));
    }
    return Image.asset(source, fit: fit, cacheWidth: cacheWidth, errorBuilder: (_, _, _) => const Icon(Icons.image_not_supported_outlined, color: AppTokens.muted));
  }
}

class SearchBox extends StatefulWidget {
  const SearchBox({required this.controller, required this.onChanged, super.key});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  State<SearchBox> createState() => _SearchBoxState();
}

class _SearchBoxState extends State<SearchBox> {
  final hints = const [
    'Search milk',
    'Search atta',
    'Search chips',
    'Search namkeen',
    'Search household',
    'Search fresh food',
  ];
  Timer? timer;
  int hintIndex = 0;

  @override
  void initState() {
    super.initState();
    timer = Timer.periodic(const Duration(seconds: 2), (_) {
      if (mounted) setState(() => hintIndex = (hintIndex + 1) % hints.length);
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hasQuery = widget.controller.text.isNotEmpty;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(17),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: TextField(
        controller: widget.controller,
        onChanged: widget.onChanged,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          prefixIcon: const Icon(Icons.search_rounded),
          suffixIcon: hasQuery
              ? IconButton(
                  onPressed: () {
                    widget.controller.clear();
                    widget.onChanged('');
                    setState(() {});
                  },
                  icon: const Icon(Icons.close_rounded),
                )
              : const Icon(Icons.mic_none_rounded),
          hintText: hints[hintIndex],
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
        ),
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({required this.title, this.subtitle, this.onTap, super.key});

  final String title;
  final String? subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 22, 18, 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    subtitle!,
                    style: const TextStyle(fontSize: 11, color: AppTokens.muted),
                  ),
                ],
              ],
            ),
          ),
          if (onTap != null)
            TextButton(onPressed: onTap, child: const Text('See all')),
        ],
      ),
    );
  }
}

class CategoryCard extends StatelessWidget {
  const CategoryCard({required this.category, required this.onTap, super.key});

  final Category category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(17),
      child: Container(
        padding: const EdgeInsets.fromLTRB(8, 9, 8, 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(17),
          border: Border.all(color: AppTokens.border),
        ),
        child: Column(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(3),
                child: SmartImage(category.image, fit: BoxFit.contain),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              category.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w800,
                height: 1.1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ProductCard extends StatefulWidget {
  const ProductCard({required this.product, required this.cart, super.key});

  final Product product;
  final CartController cart;

  @override
  State<ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends State<ProductCard> {
  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final quantity = widget.cart.quantity(product);

    return Container(
      height: 278,
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 9),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTokens.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.025),
            blurRadius: 14,
            offset: const Offset(0, 7),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 126,
            width: double.infinity,
            child: Stack(
              children: [
                Center(child: SmartImage(product.image, fit: BoxFit.contain)),
                if (product.badge.isNotEmpty)
                  Positioned(
                    top: 0,
                    left: 0,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppTokens.mint,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        product.badge,
                        style: const TextStyle(
                          fontSize: 8,
                          fontWeight: FontWeight.w900,
                          color: AppTokens.greenDark,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 7),
          Text(
            product.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 12.2,
              height: 1.12,
            ),
          ),
          const SizedBox(height: 4),
          Text(product.unit, style: const TextStyle(fontSize: 10.5, color: AppTokens.muted)),
          const Spacer(),
          Row(
            children: [
              Expanded(
                child: Text(
                  '₹${product.price.toStringAsFixed(0)}',
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
                ),
              ),
              _QuantityControl(
                product: product,
                cart: widget.cart,
                quantity: quantity,
                onChanged: () => setState(() {}),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QuantityControl extends StatelessWidget {
  const _QuantityControl({
    required this.product,
    required this.cart,
    required this.quantity,
    required this.onChanged,
  });

  final Product product;
  final CartController cart;
  final int quantity;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    if (quantity == 0) {
      return SizedBox(
        height: 40,
        child: OutlinedButton(
          onPressed: product.available
              ? () {
                  final added = cart.add(product);
                  if (!added) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('You can only add items from one store at a time.'),
                      ),
                    );
                  }
                  onChanged();
                }
              : null,
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: AppTokens.green),
            foregroundColor: AppTokens.green,
            padding: const EdgeInsets.symmetric(horizontal: 13),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
          ),
          child: const Text('ADD'),
        ),
      );
    }

    return Container(
      height: 40,
      decoration: BoxDecoration(
        color: AppTokens.mint,
        borderRadius: BorderRadius.circular(11),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () {
              cart.decrement(product);
              onChanged();
            },
            icon: const Icon(Icons.remove_rounded, size: 16, color: AppTokens.green),
            constraints: const BoxConstraints(minWidth: 34, minHeight: 40),
            padding: EdgeInsets.zero,
          ),
          Text('$quantity', style: const TextStyle(fontWeight: FontWeight.w900)),
          IconButton(
            onPressed: () {
              cart.add(product);
              onChanged();
            },
            icon: const Icon(Icons.add_rounded, size: 16, color: AppTokens.green),
            constraints: const BoxConstraints(minWidth: 34, minHeight: 40),
            padding: EdgeInsets.zero,
          ),
        ],
      ),
    );
  }
}

class VendorCard extends StatelessWidget {
  const VendorCard({required this.vendor, required this.onTap, super.key});

  final Vendor vendor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 280,
      child: Container(
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppTokens.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.025),
              blurRadius: 16,
              offset: const Offset(0, 7),
            ),
          ],
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                child: SizedBox(
                  height: 120,
                  width: double.infinity,
                  child: SmartImage(vendor.image, fit: BoxFit.cover),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            vendor.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTokens.mint,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.star_rounded, size: 13, color: AppTokens.gold),
                              const SizedBox(width: 2),
                              Text(
                                vendor.rating.toStringAsFixed(1),
                                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(vendor.category, style: const TextStyle(fontSize: 10.5, color: AppTokens.muted)),
                    const SizedBox(height: 7),
                    Row(
                      children: [
                        const Icon(Icons.near_me_outlined, size: 15, color: AppTokens.muted),
                        const SizedBox(width: 4),
                        Text('${vendor.distanceKm.toStringAsFixed(1)} km', style: const TextStyle(fontSize: 10.5, color: AppTokens.muted)),
                        const SizedBox(width: 10),
                        const Icon(Icons.schedule_outlined, size: 15, color: AppTokens.muted),
                        const SizedBox(width: 4),
                        Text('${vendor.etaMinutes} min', style: const TextStyle(fontSize: 10.5, color: AppTokens.muted)),
                        const Spacer(),
                        IconButton(
                          tooltip: 'Share',
                          onPressed: () => SharePlus.instance.share(
                            ShareParams(
                              text: '${vendor.name} on AasPass — ${vendor.category}. Nearby at ${vendor.area}.',
                            ),
                          ),
                          icon: const Icon(Icons.ios_share_rounded, size: 17, color: AppTokens.muted),
                          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                          padding: EdgeInsets.zero,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
