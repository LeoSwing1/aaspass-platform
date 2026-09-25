import 'package:flutter/material.dart';

import '../../app_controller.dart';
import '../../core/api/aaspass_api.dart';
import '../../core/widgets/ui.dart';
import '../../models/domain.dart';
import '../search/search_screen.dart';

class CategoriesScreen extends StatefulWidget {
  const CategoriesScreen({required this.cart, super.key});

  final CartController cart;

  @override
  State<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends State<CategoriesScreen> {
  List<Category> categories = const [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await AasPassApi.instance.categories();
      final next = data
          .map(
            (item) => Category(
              id: '${item['id']}',
              name: '${item['name']}',
              image: _image('${item['slug'] ?? item['name']}'),
            ),
          )
          .toList();
      if (!mounted) return;
      setState(() {
        categories = next;
        loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => loading = false);
    }
  }

  String _image(String key) {
    final value = key.toLowerCase();
    if (value.contains('snack')) return 'assets/products/chips.png';
    if (value.contains('namkeen')) return 'assets/products/bhujia.png';
    if (value.contains('beverage')) return 'assets/products/cola.png';
    if (value.contains('dairy') || value.contains('bakery')) {
      return 'assets/products/milk.png';
    }
    if (value.contains('fruit') || value.contains('vegetable')) {
      return 'assets/products/banana.png';
    }
    if (value.contains('household')) return 'assets/products/cleaner.png';
    if (value.contains('personal') || value.contains('beauty')) {
      return 'assets/products/soap.png';
    }
    if (value.contains('stationery')) return 'assets/products/notebook.png';
    if (value.contains('electronic') || value.contains('mobile')) {
      return 'assets/products/cable.png';
    }
    if (value.contains('meat') || value.contains('egg')) {
      return 'assets/products/eggs.png';
    }
    return 'assets/products/atta.png';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Categories',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => SearchScreen(cart: widget.cart),
              ),
            ),
            icon: const Icon(Icons.search_rounded),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: LayoutBuilder(
                builder: (context, box) {
                  final columns = box.maxWidth >= 720
                      ? 6
                      : box.maxWidth >= 460
                          ? 4
                          : 4;
                  return GridView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    itemCount: categories.length,
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: columns,
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 10,
                      mainAxisExtent: 132,
                    ),
                    itemBuilder: (context, index) {
                      final category = categories[index];
                      return CategoryCard(
                        category: category,
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => SearchScreen(
                              query: category.name,
                              cart: widget.cart,
                            ),
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
    );
  }
}
