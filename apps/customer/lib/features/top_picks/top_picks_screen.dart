import 'package:flutter/material.dart';
import '../../app_controller.dart';
import '../../core/api/aaspass_api.dart';
import '../../core/widgets/ui.dart';
import '../../models/domain.dart';

class TopPicksScreen extends StatefulWidget {
  const TopPicksScreen({required this.cart, super.key});
  final CartController cart;
  @override State<TopPicksScreen> createState() => _TopPicksScreenState();
}
class _TopPicksScreenState extends State<TopPicksScreen> {
  List<Product> products = const [];
  bool loading = true;
  @override void initState(){super.initState();_load();}
  Future<void> _load() async {
    try {
      final vendors = await AasPassApi.instance.vendors();
      final lists = await Future.wait(vendors.take(10).map((v)=>AasPassApi.instance.vendorProducts('${v['id']}')));
      final out=<Product>[];
      for(final list in lists){ for(final raw in list){ final j=Map<String,dynamic>.from(raw); j['image']=_image('${j['name']} ${j['category_name']??''}'); final p=Product.fromJson(j); if(p.available) out.add(p); }}
      if(mounted)setState(() { products = out; loading = false; });
    } catch (_) { if(mounted)setState(()=>loading=false); }
  }
  String _image(String text){final t=text.toLowerCase();if(t.contains('chip'))return 'assets/products/chips.png';if(t.contains('bhujia')||t.contains('namkeen'))return 'assets/products/bhujia.png';if(t.contains('milk'))return 'assets/products/milk.png';if(t.contains('soap'))return 'assets/products/soap.png';if(t.contains('clean'))return 'assets/products/cleaner.png';if(t.contains('egg'))return 'assets/products/eggs.png';if(t.contains('cable'))return 'assets/products/cable.png';return 'assets/products/atta.png';}
  @override Widget build(BuildContext context){return Scaffold(backgroundColor:const Color(0xFFF7F7F5),appBar:AppBar(title:const Text('Smart Basket',style:TextStyle(fontWeight:FontWeight.w900)),actions:[IconButton(onPressed:_load,icon:const Icon(Icons.refresh_rounded))]),body:loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:_load,child:GridView.builder(padding:const EdgeInsets.fromLTRB(14,12,14,28),itemCount:products.length,gridDelegate:const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount:2,crossAxisSpacing:10,mainAxisSpacing:10,childAspectRatio:.64),itemBuilder:(_,i)=>ProductCard(product:products[i],cart:widget.cart))));}
}
