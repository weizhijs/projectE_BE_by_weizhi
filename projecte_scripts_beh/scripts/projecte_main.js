import * as mc from "mojang-minecraft";
import * as mcui from "mojang-minecraft-ui";
import * as peconfig from "./projecte_config";
var world = mc.world;
var dm0 = world.getDimension("overworld");
var events = world.events;

const pecommandprefix = peconfig.pecommandprefix;
const pecommandlist = peconfig.pecommandlist;
const pehelp = `[ProjectE]§e§l注意: 请务必打开实验玩法中的 假日创造者功能 以及 启用游戏测试框架 ! 否则无法正常使用mod的功能!
§r注意,由于本mod的数据使用/tag和/scoreboard储存,您不能清除带有pedata或projecte字眼的玩家的部分tag或部分计分板object,否则会导致mod无法正常工作!
由于api限制, 目前转化桌的UI比较简单, 无法完全还原java版, 敬请谅解!
§l注意, 目前不能出售的物品: 所有带附魔的装备和附魔书(附魔属性会吞), 所有耐久被消耗过的装备, 部分半砖, 部分生存模式无法获得的物品, 其他模组中可用原版物品合成的物品(微软暂未开发获取配方的api)等等!
§r目前用转化桌出售物品的方法为: (i)手持1个便携转化桌, 长按或点击地面, 即可打开转化桌操作页面; 在下拉栏中选择出售物品, 按提示操作即可; (ii)请事先手持简易转化桌在聊天栏输入: on , 然后保证快捷栏中有简易转化桌,手持物品轻触(右键)地面即可。潜行出售即可全部售出该组的物品。
目前用转化桌购买物品的方法为: (i)手持便携转化桌, 长按或点击地面, 直接在文本框中输入要购买或搜索的物品, 并设置购买数量, 提交即可; (ii)手持便携转化桌, 在聊天栏中输入 <物品id> <购买个数> 即可。
您可以在聊天栏中输入 -projecte setEMC (简写为 -pe s )来为手持的物品定价, 应对本存档全局生效。
§l§o快捷指令: §r-projecte help 再次显示上述帮助文字(也可使用/function pehelp);
-projecte setEMC <customEMC:int> 可设置手持物品的EMC,注意,EMC设置的过高会导致错误!(该指令简写:-pe s)(例: -projecte setEMC 1000);
-projecte reloadEMC 用来刷新出售时物品的EMC值(不使用该指令也可在本地使用自定义EMC),并同步至目前在游戏中的所有玩家;
-projecte setemcfor <itemIdentifier:string> <customEMC:int> 可设置指定物品的EMC,与-pe setemc效果基本相同;
-projecte getplayeremc self 获取自己的EMC;
-projecte setplayeremc <EMC:int> 设置自己的EMC;`;
/*mc本地数据解释
tag:pedata解释:`pedata§k_<type:int>_${data}`
str.split("_")[1] = {
    '0':'该玩家本地的emc，值为data(int)',
    '1':'该玩家已经学习的物品,值为data(json数组->set)',
    '2':'该玩家的自定义定价物品,注意,此处仅储存模组物品,值为dict(json对象)',
    '3':'该玩家改变的原版定价物品,值为dict(json对象),
    '4':`该玩家所有学习物品所带有的多个tag,例:玩家xxx有以下tag,
    "pedata§k_4_[minecraft:grass]","pedata§k_4_[minecraft:diamond,minecraft:coal]";
    等价于:"pedata§k_2(/4)_[minecraft:grass,minecraft:diamond,minecraft:coal]"`,
    '5':'该玩家所有自定义定价物品的多个tag,每项单独一个键值对,如pedata§k_5_[weizhi:lucky_potion,1024]',
    '6':'该玩家所有自定义定价的原版物品的多个tag,与5类似'
}
scoreboard:pedata**解释:pedata00~02,字符串内容全部加起来表示emc值,所以emc值的上限为2^53-1而非2^31-1;
pedata1~3:用于储存其他数据
*/
//var prices_players = {"local": 0};
/**便携式转化桌 或 右键出售物品时快捷栏中需拥有的物品*/
var rightclicksellitem = "weizhi:transmutation_tablet";
/**等价交换转化桌方块 物品名称*/
var transtable_id = "weizhi:transmutation_table";
/**贤者之石 物品名称*/
var ph_stone = "weizhi:philosophers_stone"
var sellonrtc = 0;
var local_price = 0;
var learnedl;
var learneds;
var ticks = 0;
var currentticks = 0;
var tellhelptoplayer = 0;/*这三个变量用于延时向玩家发布初始化消息*/
var tellhelptoplayer1 = 0;
var tellhelptoplayerp;
var ticks1 = 0;
/**物品EMC信息,只读(虽然是变量) */
var prices_data = peconfig.prices_data;
var local_price_data = Object.assign({},prices_data);
var previoustick = 0;
var rangen = 4;

/*log 默认向overworld发送消息
tell 用玩家所处的维度给玩家发送消息
tellas 替代实体向最近的玩家发送消息
(暂未添加: tellto 向名称为xxx的玩家发送指定消息)*/
function log(msg, logdimension=world.getDimension("overworld")) {
    logdimension.runCommand(`tellraw @a {\"rawtext\":[{\"text\":\"[ProjectE]${msg}\"}]}`);
}
function tell(player, msg) {
    let playername = player.name ?? player.nameTag;
    player.dimension.runCommand(`tellraw ${playername} {\"rawtext\":[{\"text\":\"${msg}\"}]}`);
}
function tellas(entity, msg, r='@p') {
    entity.runCommand(`tellraw ${r} {\"rawtext\":[{\"text\":\"${msg}\"}]}`);
}
/**getalltag(player,data,startwith)可用于获取玩家标签上的mod信息,其标签必须以startwith为开头,
格式可以是:pedata§k-1-['minecraft:diamond','identifier:itemName'] ;
若§k-后面的数字小于4,将会返回后面的字符串,如`['minecraft:diamond','identifier:itemName']`,
可以用JSON.parse()转换为对象;
若§k-后面的数字属于[4,6],则返回该玩家所有该数字标签的字符串组成的列表,
如[`['minecraft:diamond','minecraft:coal','minecraft:grass']`,`['idfentifier:itemName']`],
该功能用于防止mc的tag有字数限制 */
function getalltag(player,data='1',startwith='pedata§k-') {
    var tags = player.getTags();
    var l0 = [];
    if (tags.length > 0) {
        var tagsl;
        for (var i in tags) {
            if (tags[i].startsWith(startwith)) {
                tagsl = tags[i].split(startwith.slice(-1)); //else if (tagsl[1]=="0"){local_price = + tagsl[2];}应加到第二个,但已用scoreboard代替
                if (tagsl[1]==data) {
                    if (Number(data)<=3) {
                        return tagsl[2];
                        //return JSON.parse(tagsl[2].replaceAll(`'`,`"`));
                    } else if (Number(data)<=6) {
                        l0.push(tagsl[2]);
                        //custom_items_prices = JSON.parse(tagsl[2]);
                        //custom_minecraft_prices = JSON.parse(tagsl[2]);
                    }
                }
            }
        }
    } else {
        player.addTag(`${startwith}${data}-[]`);
        return `[]`;
    }
    return l0;
}
/**getobject(s)可用于将getalltag()中data值>3时获取的多个字符串标签(内容为列表或字典)组成的列表,
如[`['minecraft:diamond','minecraft:coal','minecraft:grass']`,`['idfentifier:itemName']`]  )
中的各个列表合并为大列表或大字典*/
function getobject(s) {
    //var l=JSON.parse(s.replaceAll(`'`,`"`));
    for (let i in s) {
        s[i]=JSON.parse(s[i].replaceAll(`'`,`"`));
    }
    var sum;
    if (s[0] instanceof Array) {
        sum=[];
        for (let i in s) {
            sum.push(...s[i]);
        }
    } else {
        sum={};
        for (let i in s) {
            Object.assign(sum,s[i]);
        }
    }
    return sum;  
}
/**用于获取tag1-3的原始数据 */
const getalltags = (player,data='1',startwith='pedata§k-') => JSON.parse((getalltag(player,data,startwith)).replaceAll(`'`,`"`));
/**getscore()可用于获取计分板数据,r为pedataxx中xx的范围,通常设置为[0,2],
系统将读取00,01,02的数据,并将其转化为字符串后合并再转化为int,
这样便可以获取到2^64以下的所有数字,但由于JavaScript精度限制,
目前不大于2^53-1的数字才是有效的*/
function getscore(player,obj='pedata00',r=[]) {
    var scores = player.runCommand(`scoreboard players list @s`).statusMessage;
    if (r.length==2) {
        var sum = '';
        var i1,i2;
        for (var i=r[1]; i>=r[0]; i--) {
            if (String(i).length<=1) {
                i1='pedata0'+String(i);
            } else {
                i1='pedata'+String(i);
            }
            i2 = scores.substring(scores.indexOf(i1)+2+i1.length,scores.length).split(' ')[0];
            while (i2.length<9) {
                i2 = '0'+i2;
            }
            sum += i2;
        }
        while (sum.startsWith('0')) {
            sum = sum.replace('0','');
        }
        return (+ sum);
    } else {
        return (+ scores.substring(scores.indexOf(obj)+2+obj.length,scores.length).split(' ')[0]);
    }
}
/**用于读取积分版中objectives上指定物品后所带的数字信息*/
function getscoreo(id,player=world.getDimension("overworld"),starts='pe-') {
    var scores = player.runCommand(`scoreboard objectives list`).statusMessage;
    id=id.replace('minecraft:','')
    return (scores.substring(scores.indexOf(starts+id)+starts.length+id.length+1,scores.length).split(`'`)[0]);
}
/**轻触地面出售物品world.events.beforeItemUseOn的回调函数*/
const sellonuse = e => {
    ticks1 = currentticks;
    let item = e.item;
    let item_id = item.id;
    let player = e.source;
    var offhandi;
    var issell = 0;
    var i;
    let scores = player.runCommand("scoreboard objectives list").statusMessage;
    var custom_prices = {};
    var displays;
    var displays0;
    while (scores.indexOf('pe-')>=0) {
        displays = (scores.substring(scores.indexOf('pe-')+3,scores.length).split(`'`)[0]).split(`-`);
        displays0 = displays[0].includes(':') ? displays[0] : 'minecraft:'+displays[0];
        custom_prices[displays0] = Number(displays[1]);
        scores = scores.replace('pe-','p-');
    }
    Object.assign(local_price_data,custom_prices);
    if (item_id==rightclicksellitem) {
        let temp0 = getscore(player, 'pedata00', [0, 2]);
        let templ1 = getalltags(player,'1');
        var playerinvcontainer = player.getComponent("minecraft:inventory").container;
        let playerinv = [];
        for (i=0;i<27;i++) {
            playerinv.push(`#${i+1}:${playerinvcontainer.getItem(i)?.id}[${playerinvcontainer.getItem(i)?.data}]*${playerinvcontainer.getItem(i)?.amount}`);
        }
        var form = new mcui.ModalFormData()
        .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
        .dropdown(`请选择模式:`,['购买或搜索','购买(从下拉列表中选择),选择后直接提交即可','出售物品','遗忘已学习物品'],0)
        .textField('请输入物品id:','例: diamond')
        .slider('请拖动选择数量',1,64,1,64);
        form.show(player).then((response) => {
            var r = response.formValues;
            var r0 = r[0];
            var r1 = r[1].includes(':') ? r[1] : 'minecraft:'+r[1];
            let r1p = r[1].includes(':') ? r[1] : ':';
            var r2 = r[2];
            var templ2 = templ1.filter(element => element.includes(r[1]));
            var temp1 = local_price_data[r1];
            var temp2 = temp1*r2;
            if (r0==3) {
                let tags = getalltags(player,'1');
                let tags0 = getalltag(player,'1');
                player.removeTag(`pedata§k-1-${tags0}`);
                tags.splice(tags.indexOf(r1),1);
                player.addTag(`pedata§k-1-${JSON.stringify(tags).replaceAll(`"`,`'`)}`);
                tellas(player,`已尝试遗忘${r1}, 无法再次购买`);
            } else if (r0==2) {
                let templ3 = playerinv.filter(element => element.includes(r1p)&&!element.includes('undefined'));
                templ3.unshift(`(未选择,将读取下面的数据)`)
                var form1 = new mcui.ModalFormData()
                .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                .dropdown(`搜索结果如下, 请选择要出售的物品栏槽位:`,templ3,0)
                .dropdown(`也可选择背包中的指定物品栏槽位(两者选一个填写即可):`,playerinv)
                form1.show(player).then((response1) => {
                    let r11 = response1.formValues[0]==0 ? playerinv[response1.formValues[1]] : templ3[response1.formValues[0]];
                    //let r11n = Number(r11.split(':')[0].slice(1));
                    if (r11.includes('undefined')) {
                        tellas(player,`§c选择的物品栏可能为空!`);
                        return;
                    }
                    let local_price = temp0;
                    let local_price0 = local_price;
                    let item_amount = r11.split('*')[1];
                    let item_data = r11.split('[')[1].split(']')[0];
                    let item_id = r11.split(':')[1]+':'+r11.split(':')[2].split('[')[0];
                    let item_id1 = item_data>0 ? `${item_id}[${item_data}]` : item_id;
                    if (local_price_data[item_id1]==undefined) {
                        item_id1 = item_id1.split('[')[0];
                    }
                    var item_price = local_price_data[item_id1] * item_amount;
                    if (!Number.isSafeInteger(item_price)) {
                        tellas(player,`§c该物品(${item_id})的EMC值未定义或过大!`);
                        return;
                    }
                    local_price += item_price;
                    let learnedl0 = getalltag(player,'1');
                    let learnedl = getalltags(player,'1')
                    if (!Number.isSafeInteger(local_price)) {
                        tellas(player, '§c您的EMC值已超过最大容量,可能会引发异常错误! 可使用§r/function projecte/clearplayeremc §c清零!', '@s');
                        tellas(player, '§c出售物品失败!', '@s');
                        return;
                    } else if (local_price != local_price0) {
                        player.runCommand(`clear @s ${item_id} ${item_data} ${item_amount}`);
                        player.removeTag(`pedata§k-1-${learnedl0}`);
                        learnedl.push(item_id1);
                        learneds = [...new Set(learnedl)];
                        player.addTag(`pedata§k-1-${JSON.stringify(learneds).replaceAll(`"`,`'`)}`);
                        if (local_price < 1000000000) {
                            player.runCommand(`scoreboard players set @s pedata00 ${local_price}`);
                        } else {
                            let local_price_s = String(local_price);
                            while (local_price_s.length < 27) {
                                local_price_s = '0'+local_price_s;
                            }
                            player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                            player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                            player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                        }
                        tellas(player, `出售前EMC: ${temp0} 已出售${item_amount}个${item_id} (EMC=${item_price},data=${item_data}),出售后EMC: ${local_price}`);
                    }
                });
            } else if (r0==1) {
                let templ11 = [];
                for (i in templ1) {
                    templ11.push(`${templ1[i]} emc:${local_price_data[templ1[i]]}`);
                }
                var form1 = new mcui.ModalFormData()
                .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                .dropdown(`请选择要购买的物品id:`,templ11)
                .slider('请拖动选择购买数量',1,64,1,64);
                form1.show(player).then((response1) => {
                    r1 = templ1[response1.formValues[0]];
                    r2 = response1.formValues[1];
                    r0 = 0;
                    temp1 = local_price_data[r1];
                    let datav = r1.includes('[') ? r1.split('[')[1].split(']')[0] : 0;
                    let r1p = r1.includes('[') ? r1.split('[')[0] : r1;
                    if (local_price_data[r1]==undefined) {
                        temp1 = local_price_data[r1p];
                    }
                    temp2 = temp1*r2;
                    if (temp0-temp2>0) {
                        player.runCommand(`give @p ${r1p} ${r2} ${datav}`);
                        let local_price_s = String(temp0-temp2);
                        while (local_price_s.length < 27) {
                            local_price_s = '0'+local_price_s;
                        }
                        player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                        player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                        player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                        tellas(player,`花费${temp2} EMC, 已购买${r2}个${r1}`);
                    } else {
                        let temp3 = Math.floor(temp0/temp1);
                        var form2 = new mcui.ModalFormData()
                        .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                        .slider(`§c目前您有${temp0}EMC,最多购买${temp3}个${r1}(该物品单价:${temp1})\n§r请拖动选择数量`,1,temp3,1,temp3);
                        form2.show(player).then((response2) => {
                            let r22 = response2.formValues[0];
                            let temp22 = temp1*r22;
                            if (temp0-temp22>0) {
                                player.runCommand(`give @p ${r1p} ${r22} ${datav}`);
                                let local_price_s = String(temp0-temp22);
                                while (local_price_s.length < 27) {
                                    local_price_s = '0'+local_price_s;
                                }
                                player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                                player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                                player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                                tellas(player,`花费${temp22} EMC, 已购买${r22}个${r1}`);
                            } else {
                                tellas(player,`§c目前您有${temp0}EMC,最多购买${temp3}个${r1}(该物品单价:${temp1})`);
                            }
                        });
                    }
                });
            } else if (r0==0) {
                if (temp0-temp2>0 && templ1.includes(r1)) {
                    let datav = r1.includes('[') ? r1.split('[')[1].split(']')[0] : 0;
                    let r1p = r1.includes('[') ? r1.split('[')[0] : r1;
                    player.runCommand(`give @p ${r1p} ${r2} ${datav}`);
                    let local_price_s = String(temp0-temp2);
                    while (local_price_s.length < 27) {
                        local_price_s = '0'+local_price_s;
                    }
                    player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                    player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                    player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                    tellas(player,`花费${temp2} EMC, 已购买${r2}个${r[1]}`);
                } else if (temp0-temp2<=0 && templ1.includes(r1)) {
                    let datav = r1.includes('[') ? r1.split('[')[1].split(']')[0] : 0;
                    let r1p = r1.includes('[') ? r1.split('[')[0] : r1;
                    let temp3 = Math.floor(temp0/temp1);
                    var form2 = new mcui.ModalFormData()
                    .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                    .slider(`§c目前您有${temp0}EMC,最多购买${temp3}个${r[1]}(该物品单价:${temp1})\n§r请拖动选择数量`,1,temp3,1,temp3);
                    form2.show(player).then((response2) => {
                        let r22 = response2.formValues[0];
                        let temp22 = temp1*r22;
                        if (temp0-temp22>0) {
                            player.runCommand(`give @p ${r1p} ${r22} ${datav}`);
                            let local_price_s = String(temp0-temp22);
                            while (local_price_s.length < 27) {
                                local_price_s = '0'+local_price_s;
                            }
                            player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                            player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                            player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                            tellas(player,`花费${temp22} EMC, 已购买${r22}个${r[1]}`);
                        } else {
                            tellas(player,`§c目前您有${temp0}EMC,最多购买${temp3}个${r[1]}(该物品单价:${temp1})`);
                        }
                    });
                } else {
                    let templ11 = [];
                    for (i in templ2) {
                        templ11.push(`${templ2[i]} emc:${local_price_data[templ2[i]]}`);
                    }
                    var form3 = new mcui.ModalFormData()
                    .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                    .dropdown(`§c物品不存在于已学习物品列表中或格式不规范, §r搜索${r[1]}的结果为: ${templ2}\n可在以下结果中选择或在下面的文本框中输入:`,templ11)
                    .textField('','')
                    .slider('请拖动选择数量',1,64,1,64);
                    form3.show(player).then((response3) => {
                        let r3 = response3.formValues;
                        let r31 = r3[1]=='' ? templ2[r3[0]] : (r3[1].includes(':') ? r3[1] : 'minecraft:'+r3[1]);
                        let datav = r31.includes('[') ? r31.split('[')[1].split(']')[0] : 0;
                        let r1p = r31.includes('[') ? r31.split('[')[0] : r31;
                        temp1 = local_price_data[r31];
                        if (local_price_data[r31]==undefined) {
                            temp1 = local_price_data[r1p];
                        }
                        
                        temp2 = temp1*r3[2];
                        if (temp0-temp2>0) {
                            player.runCommand(`give @p ${r1p} ${r3[2]} ${datav}`);
                            let local_price_s = String(temp0-temp2);
                            while (local_price_s.length < 27) {
                                local_price_s = '0'+local_price_s;
                            }
                            player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                            player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                            player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                            tellas(player,`花费${temp2} EMC, 已购买${r3[2]}个${r31}`);
                        } else if (temp0-temp2<=0) {
                            let temp3 = Math.floor(temp0/temp1);
                            var form4 = new mcui.ModalFormData()
                            .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                            .slider(`§c目前您有${temp0}EMC,最多购买${temp3}个${r31}(该物品单价:${temp1})\n§r请拖动选择数量`,1,temp3,1,temp3);
                            form4.show(player).then((response4) => {
                                let r22 = response4.formValues[0];
                                let temp22 = temp1*r22;
                                if (temp0-temp22>0) {
                                    player.runCommand(`give @p ${r1p} ${r22} ${datav}`);
                                    let local_price_s = String(temp0-temp22);
                                    while (local_price_s.length < 27) {
                                        local_price_s = '0'+local_price_s;
                                    }
                                    player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                                    player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                                    player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                                    tellas(player,`花费${temp22} EMC, 已购买${r22}个${r31}`);
                                } else {
                                    tellas(player,`§c目前您有${temp0}EMC,最多购买${temp3}个${r31}(该物品单价:${temp1})`);
                                }
                            });
                        } else {
                            tellas(player,`§c输入的内容可能存在错误!`)
                        }
                    });
                }
            }
        });
        return;
    }
    for (i = 0; i <= 8; i++) {
        offhandi = player.getComponent("minecraft:inventory").container.getItem(i);
        if (offhandi==undefined) {
            continue;
        } else if (offhandi.id==rightclicksellitem) {
            issell = 1;
            break;
        }
    }
    if (local_price_data[item_id]!=undefined && issell && sellonrtc) {
        //let playername = player.name ?? player.nameTag;
        //var custom_items_prices = {};
        //var custom_minecraft_prices = {};
        let item_data = item.data;
        let item_id1 = item_data>0 ? `${item_id}[${item_data}]` : item_id ;
        let item_id2 = item_id1;
        let tags = player.getTags();
        local_price = getscore(player, 'pedata00', [0, 2]);
        var learnedl0;
        if (tags.length > 0) {
            var tagsl;
            for (i in tags) {
                if (tags[i].startsWith('pedata§k-')) {
                    tagsl = tags[i].split('-'); //else if (tagsl[1]=="0"){local_price = + tagsl[2];}应加到第二个,但已用scoreboard代替
                    if (tagsl[1]=="1") {
                        learnedl0 = tagsl[2];
                        learnedl = JSON.parse(learnedl0.replaceAll(`'`,`"`));
                    }/* else if (tagsl[1]=="2") {
                        custom_items_prices = JSON.parse(tagsl[2]);
                    } else if (tagsl[1]=="3") {
                        custom_minecraft_prices = JSON.parse(tagsl[2]);
                    }*/
                }
            }
        };
        if (learnedl == undefined) {
            learnedl0 = '[]';
            learnedl = [];
            player.addTag(`pedata§k-1-[]`);
        }
        let local_price0 = local_price;

        var item_amount = 1;
        if (player.isSneaking) {
            item_amount = item.amount;
        }
        if (local_price_data[item_id1]==undefined) {
            item_id1 = item_id1.split('[')[0];
        }
        var item_price = local_price_data[item_id1] * item_amount;
        local_price += item_price;
        if (!Number.isSafeInteger(local_price)) {
            tellas(player, '§c物品EMC值异常或EMC值已超过最大容量,可能会引发异常错误! 可使用§r/function projecte/clearplayeremc §c清零! 出售物品失败!', '@s');
            return;
        } else if (local_price != local_price0) {
            player.runCommand(`clear @s ${item_id} ${item_data} ${item_amount}`);
            player.removeTag(`pedata§k-1-${learnedl0}`);
            learnedl.push(item_id2);
            learneds = [...new Set(learnedl)];
            player.addTag(`pedata§k-1-${JSON.stringify(learneds).replaceAll(`"`,`'`)}`);
            if (local_price < 1000000000) {
                player.runCommand(`scoreboard players set @s pedata00 ${local_price}`);
            } else {
                let local_price_s = String(local_price);
                while (local_price_s.length < 27) {
                    local_price_s = '0'+local_price_s;
                }
                player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
            }
            tellas(player, `出售前EMC: ${local_price} 已出售${item_amount}个${item_id} (EMC=${item_price},data=${item_data}),出售后EMC: ${local_price}`);
        }
    }
};
events.beforeChat.subscribe(e => {
    /*快捷指令判断 */
    if (e.message.startsWith(pecommandprefix) || e.message.startsWith("-projecte")){
        let msglist = e.message.toLowerCase().split(" ");
        let player = e.sender;
        let playername = player.name ?? player.nameTag;
        let dim = player.dimension;
        if (msglist.length <= 1 || msglist[1] == '') {
            tellas(player,`§c输入/function pehelp 或-projecte help 以查看帮助!`);
            return
        }
        var item_id = player.getComponent("minecraft:inventory").container.getItem(player.selectedSlot)?.id;
        switch(msglist[1]) {
            case 'help':
                e.cancel = true;
                tellas(player,pehelp);
                break;
            case 'setemc':
                e.cancel = true;
                if (item_id!=undefined) {
                    let scores = player.runCommand(`scoreboard objectives list`).statusMessage;
                    //player.runCommand(`scoreboard players set ${item_id} pedata51 ${msglist[2]}`);
                    let item_id1 = item_id.replace('minecraft:','');
                    if (scores.includes(`pe-${item_id1}-`)) {
                        player.runCommand(`scoreboard objectives remove p-${item_id1}`);
                    }
                    let item_id2 = `pe-${item_id1}-${msglist[2]}`;
                    if (item_id2.length>32) {
                        tellas(player,`§c定价失败, 原因: 物品名称过长或价格设置过高!`);
                        return;
                    }
                    if (String(prices_data[item_id])==msglist[2] || msglist[2].startsWith('d')) {
                        tellas(player,`已尝试将${item_id}的价格设为${msglist[2]}(默认值)! 重新进入世界后生效!`);
                        return;
                    }
                    player.runCommand(`scoreboard objectives add p-${item_id1} dummy pe-${item_id1}-${msglist[2]}`);
                    tellas(player,`已尝试将${item_id}的价格设为${msglist[2]}!`);
                } else {
                    tellas(player,`§c定价失败, 请手持物品后重试!`);
                }
                break;
            case 's':
                e.cancel = true;
                if (item_id!=undefined) {
                    let scores = player.runCommand(`scoreboard objectives list`).statusMessage;
                    //player.runCommand(`scoreboard players set ${item_id} pedata51 ${msglist[2]}`);
                    let item_id1 = item_id.replace('minecraft:','');
                    if (scores.includes(`pe-${item_id1}-`)) {
                        player.runCommand(`scoreboard objectives remove p-${item_id1}`);
                    }
                    let item_id2 = `pe-${item_id1}-${msglist[2]}`;
                    if (item_id2.length>32) {
                        tellas(player,`§c定价失败, 原因: 物品名称过长或价格设置过高!`);
                        return;
                    }
                    if (String(prices_data[item_id])==msglist[2] || msglist[2].startsWith('d')) {
                        tellas(player,`已尝试将${item_id}的价格设为${msglist[2]}(默认值)! 重新进入世界后生效!`);
                        return;
                    }
                    player.runCommand(`scoreboard objectives add p-${item_id1} dummy pe-${item_id1}-${msglist[2]}`);
                    tellas(player,`已尝试将${item_id}的价格设为${msglist[2]}!`);
                } else {
                    tellas(player,`§c定价失败, 请手持物品后重试!`);
                }
                break;
            case 'reloademc':
                e.cancel = true;
                local_price_data = Object.assign({},prices_data);
                tellas(player,`已尝试重载自定义物品价格至所有玩家!`);
                break;
            case 'gettable':
                let tags = getalltags(player,'1');
                let temp0 = getscore(player, 'pedata00', [0, 2]);
                let temp2 = local_price_data[rightclicksellitem];
                if (tags.includes(rightclicksellitem) && temp0>temp2) {
                    player.runCommand(`give @s ${rightclicksellitem}`);
                    let local_price_s = String(temp0-temp2);
                    while (local_price_s.length < 27) {
                        local_price_s = '0'+local_price_s;
                    }
                    player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                    player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                    player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                    tellas(player,`花费${temp2}EMC, 已将一个${rightclicksellitem}给予玩家`);
                } else {
                    tellas(player,`转化桌尚未学习或EMC不足! `)
                }
                break;
            case 'setemcfor':
                let scores = player.runCommand(`scoreboard objectives list`).statusMessage;
                //player.runCommand(`scoreboard players set ${item_id} pedata51 ${msglist[2]}`);
                let item_id1 = msglist[2].replace('minecraft:','');
                let item_id3 = msglist[2].includes(':') ? msglist[2] : 'minecraft:'+msglist[2];
                if (scores.includes(`pe-${item_id1}-`)) {
                    player.runCommand(`scoreboard objectives remove p-${item_id1}`);
                }
                let item_id2 = `pe-${item_id1}-${msglist[3]}`;
                if (item_id2.length>32) {
                    tellas(player,`§c定价失败, 原因: 物品名称过长或价格设置过高!`);
                    return;
                }
                if (String(prices_data[item_id3])==msglist[3] || msglist[3].startsWith('d')) {
                    tellas(player,`已尝试将${msglist[2]}的价格设为${msglist[3]}(默认值)!`);
                    return;
                }
                player.runCommand(`scoreboard objectives add p-${item_id1} dummy pe-${item_id1}-${msglist[3]}`);
                tellas(player,`已尝试将${msglist[2]}的价格设为${msglist[3]}!`);
                break;
            case 'getplayeremc':
                tellas(player,`${playername}的EMC: ${getscore(player,'pedata00',[0,2])}`);
                e.cancel = true;
                break;
            case 'setplayeremc':
                let local_price_s = msglist[2];
                while (local_price_s.length<27) {
                    local_price_s = '0'+local_price_s;
                }
                player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18,-9)}`);
                player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27,-18)}`);
                tellas(player,`已尝试设置${playername}的EMC为: ${getscore(player,'pedata00',[0,2])}`);
                break;
            default:
                tellas(player,`§c输入/function pehelp 或-projecte help 以查看帮助!`);
        }/*手持test转化桌购买物品判断*/
    } else if ((e.sender.getComponent("minecraft:inventory")).container.getItem(e.sender.selectedSlot)?.id==rightclicksellitem){
        let player = e.sender;
        let playername = player.name ?? player.nameTag;
        let dim = player.dimension;
        let msglist = e.message.toLowerCase().split(" ");
        let msgl0 = msglist[0];
        let temp0 = getscore(player, 'pedata00', [0, 2]);
        let templ1 = getalltags(player,'1');
        if (msgl0=='off' || msgl0.startsWith('关闭快捷出售')) {
            sellonrtc = 0;
            tellas(player,`已关闭转化桌在快捷栏时的快捷出售功能!`);
        } else if (msgl0=='on' || msgl0.startsWith('启用快捷出售')) {
            sellonrtc = 1;
            tellas(player,`已启用转化桌在快捷栏时的快捷出售功能!`);
        } else if (msgl0=='s' || msgl0.startsWith('search')) {
            let msgl1 = msglist[1];
            let temp1 = templ1.filter(element => element.includes(msgl1));

            tellas(player,`搜索: ${msgl1} 结果: ${temp1}`);
            if (temp1.length==1) {
                let temp2 = local_price_data[temp1[0]];
                tellas(player,`目前您有${temp0}EMC,最多购买${Math.floor(temp0/temp2)}个${temp1[0]}(该物品单价:${temp2})`);
            }

        } else if (msgl0=='g' || msgl0=='get') {
            let msgl1 = msglist[1].includes(':') ? msglist[1] : 'minecraft:'+msglist[1];
            let temp1 = templ1.filter(element => element==msgl1);
            let temp2 = local_price_data[temp1[0]];
            tellas(player,`目前您有${temp0}EMC,最多购买${Math.floor(temp0/temp2)}个${temp1[0]}(该物品单价:${temp2})`);
        } else if (msgl0=='forget') {
            let msgl1 = msglist[1].includes(':') ? msglist[1] : 'minecraft:'+msglist[1];
            let tags = getalltags(player,'1');
            let tags0 = getalltag(player,'1');
            player.removeTag(`pedata§k-1-${tags0}`);
            tags.splice(tags.indexOf(msgl1),1);
            player.addTag(`pedata§k-1-${JSON.stringify(tags).replaceAll(`"`,`'`)}`);
            tellas(player,`已尝试遗忘${msgl1}, 无法再次购买`);
        } else {
            if (msglist.length==1) {
                let temp1 = templ1.filter(element => element.includes(msgl0));
                let temp11 = templ1.filter(element => element==msgl0);
                let temp3 = msgl0.includes(':') ? msgl0 : 'minecraft:'+msgl0;
                let temp2 = local_price_data[temp3];
                let amount = 64;
                if (temp3=='minecraft:water_bucket') {
                    amount = 1;
                }
                if (temp1.length>0 && temp2*amount<temp0) {
                    player.runCommand(`give @p ${msgl0} ${amount}`);
                    let local_price_s = String(temp0-temp2*amount);
                    while (local_price_s.length < 27) {
                        local_price_s = '0'+local_price_s;
                    }
                    player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                    player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                    player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                    tellas(player,`已购买${amount}个${msgl0}`);
                } else if (temp11.length>0) {
                    tellas(player,`目前您有${temp0}EMC,最多购买${Math.floor(temp0/temp2)}个${temp1[0]}(该物品单价:${temp2})`);
                } else {
                    tellas(player,`§c物品不存在于已学习物品列表中或格式不规范, §r搜索${msgl0}的结果为: ${temp1}`);
                }
            } else {
                let msgl1 = msglist[1];
                let amount = Number(msgl1);
                let msgl2 = msglist[2] ?? 0;
                let temp1 = templ1.filter(element => element.includes(msgl0));
                let temp3 = msgl0.includes(':') ? msgl0 : 'minecraft:'+msgl0;
                let temp2 = local_price_data[temp3];
                if (temp1.includes(temp3)) {
                    if (temp2*amount<temp0) {
                        player.runCommand(`give @p ${msgl0} ${msgl1} ${msgl2}`);
                        let local_price_s = String(temp0-temp2*amount);
                        while (local_price_s.length < 27) {
                            local_price_s = '0'+local_price_s;
                        }
                        player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                        player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                        player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                        tellas(player,`已购买${amount}个${msgl0}(data=${msgl2})`);
                    } else {
                        tellas(player,`目前您有${temp0}EMC,最多购买${Math.floor(temp0/temp2)}个${msgl0}(该物品单价:${temp2})`);
                    }
                }
                else {
                    tellas(player,`§c物品不存在于已学习物品列表中或格式不规范, §r搜索${msgl0}的结果为: ${temp1}`);
                }
            }
        }
    } else if ((e.sender.getComponent("minecraft:inventory")).container.getItem(e.sender.selectedSlot)?.id==ph_stone) {
        if (e.message.startsWith('v')) {
            rangen+=1;
            if (rangen>4) rangen=0;
            tellas(e.sender,`[贤者之石]目前贤者之石的充能等级: ${rangen}`);
        }
    } else if (e.message.startsWith("sb")){
        let player = e.sender.name ?? e.sender.nameTag;
        let dim = e.sender.dimension;
        log(getscoreo('x'))
        //log(JSON.stringify(peconfig.prices_data).replaceAll(`"`,`'`));
        log(peconfig.prices_data['minecraft:polished_granite'])
        log(`${peconfig.prices_data["minecraft:stone"]}  ${peconfig.prices_data["minecraft:polished_granite"]}`)
        let item = (e.sender.getComponent("minecraft:inventory")).container.getItem(e.sender.selectedSlot);
        let item1 = item.getComponents()
        var iteme
        for (i in item1) {
            log(item1[i].id)
            if (item1[i].id=='minecraft:enchantments') iteme = item1[i];
        }
        
        log(item)
        log(`${item.amount}  ${item.data}    ${item.id}  nametag=${item.nameTag}`)
        log(JSON.stringify(item1))
        item1[0].removeAllEnchantments()
        let item2 = item1[0].enchantments.hasEnchantment(new mc.Enchantment('fortune'));
        log(item2)
        dim.runCommand('say test');
        dim.runCommand('say '+player);
        

    } else if (e.message.startsWith("te")){
        let playername = e.sender.name ?? e.sender.nameTag;
        let player=e.sender;
        let dim = e.sender.dimension;
        e.sender.addTag(`pedata§k_0_${231}`);
        e.sender.removeTag(`pedata§k_0_${231}`);
        let r=[0,2];
        var scores = player.runCommand(`scoreboard players list @s`).statusMessage;
        var sum = '';
        var i1,i2;
        for (var i=r[1]; i>=r[0]; i--) {
            if (String(i).length<=1) {
                i1='pedata0'+String(i);
            } else {
                i1='pedata'+String(i);
            }
            i2 = scores.substring(scores.indexOf(i1)+2+i1.length,scores.length).split(' ')[0];
            while (i2.length<9) {
                i2 = '0'+i2;
            }
            player.runCommand(`say "${i2}"`);
            sum += i2;
        }
        player.runCommand(`say "${sum}"`);
        while (sum.startsWith('0')) {
            sum = sum.replace('0','');
        }
        log(sum);
    } else if (e.message.startsWith("t")) {
        log('t')
    }
});
events.playerJoin.subscribe(e => {
    tellhelptoplayer = 1;
    /*用于让events.tick识别到并实现延时*/
    tellhelptoplayerp = e.player;
    //e.player.runCommand('function projecte/initscore');
    /*let dim = e.player.dimension;
    let player = e.player.name ?? e.player.nameTag;
    function f() {dim.runCommand(`tellrow ${player} {\"rawtext\":[{\"text\":\"${pehelp}\"}]}`);};
    var i = setTimeout("f()",3000);*/
});
events.tick.subscribe(e => {
    currentticks = e.currentTick;
    if (e.currentTick % 30 == 0) {
        if (tellhelptoplayer) {
            ticks = e.currentTick;
            tellhelptoplayer = 0;
            tellhelptoplayer1 = 1;
        }
        if (e.currentTick-ticks>100) {
            if (tellhelptoplayer1) {
                tell(tellhelptoplayerp,pehelp);
                tellhelptoplayerp.runCommand('function projecte/initscore');
                tellhelptoplayer1 = 0;
            }
        }
    }
});
events.beforeItemUseOn.subscribe(sellonuse);
events.beforeItemUse.subscribe(sellonuse);
events.itemUseOn.subscribe(e => {
    if (currentticks-previoustick<20) {
        return;
    }
    previoustick = currentticks;
    let player = e.source;
    let item_id = e.item.id;
    let dim = player.dimension;
    let block_ids = dim.getBlock(e.blockLocation).id;
    let block_idd = dim.getBlock(e.blockLocation).permutation.getAllProperties();
    let x = e.blockLocation.x;
    let y = e.blockLocation.y;
    let z = e.blockLocation.z;
    var i;
    if (block_ids==transtable_id) {
        let temp0 = getscore(player, 'pedata00', [0, 2]);
        let templ1 = getalltags(player,'1');
        var playerinvcontainer = player.getComponent("minecraft:inventory").container;
        let playerinv = [];
        for (i=0;i<27;i++) {
            playerinv.push(`#${i+1}:${playerinvcontainer.getItem(i)?.id}[${playerinvcontainer.getItem(i)?.data}]*${playerinvcontainer.getItem(i)?.amount}`);
        }
        var form = new mcui.ModalFormData()
        .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
        .dropdown(`请选择模式:`,['购买或搜索','购买(从下拉列表中选择),选择后直接提交即可','出售物品','遗忘已学习物品'],0)
        .textField('请输入物品id:','例: diamond')
        .slider('请拖动选择数量',1,64,1,64);
        form.show(player).then((response) => {
            var r = response.formValues;
            var r0 = r[0];
            var r1 = r[1].includes(':') ? r[1] : 'minecraft:'+r[1];
            let r1p = r[1].includes(':') ? r[1] : ':';
            var r2 = r[2];
            var templ2 = templ1.filter(element => element.includes(r[1]));
            var temp1 = local_price_data[r1];
            var temp2 = temp1*r2;
            if (r0==3) {
                let tags = getalltags(player,'1');
                let tags0 = getalltag(player,'1');
                player.removeTag(`pedata§k-1-${tags0}`);
                tags.splice(tags.indexOf(r1),1);
                player.addTag(`pedata§k-1-${JSON.stringify(tags).replaceAll(`"`,`'`)}`);
                tellas(player,`已尝试遗忘${r1}, 无法再次购买`);
            } else if (r0==2) {
                let templ3 = playerinv.filter(element => element.includes(r1p)&&!element.includes('undefined'));
                templ3.unshift(`(未选择,将读取下面的数据)`)
                var form1 = new mcui.ModalFormData()
                .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                .dropdown(`搜索结果如下, 请选择要出售的物品栏槽位:`,templ3,0)
                .dropdown(`也可选择背包中的指定物品栏槽位(两者选一个填写即可):`,playerinv)
                form1.show(player).then((response1) => {
                    let r11 = response1.formValues[0]==0 ? playerinv[response1.formValues[1]] : templ3[response1.formValues[0]];
                    //let r11n = Number(r11.split(':')[0].slice(1));
                    if (r11.includes('undefined')) {
                        tellas(player,`§c选择的物品栏可能为空!`);
                        return;
                    }
                    let local_price = temp0;
                    let local_price0 = local_price;
                    let item_amount = r11.split('*')[1];
                    let item_data = r11.split('[')[1].split(']')[0];
                    let item_id = r11.split(':')[1]+':'+r11.split(':')[2].split('[')[0];
                    let item_id1 = item_data>0 ? `${item_id}[${item_data}]` : item_id;
                    if (local_price_data[item_id1]==undefined) {
                        item_id1 = item_id1.split('[')[0];
                    }
                    var item_price = local_price_data[item_id1] * item_amount;
                    if (!Number.isSafeInteger(item_price)) {
                        tellas(player,`§c该物品(${item_id})的EMC值未定义或过大!`);
                        return;
                    }
                    local_price += item_price;
                    let learnedl0 = getalltag(player,'1');
                    let learnedl = getalltags(player,'1')
                    if (!Number.isSafeInteger(local_price)) {
                        tellas(player, '§c您的EMC值已超过最大容量,可能会引发异常错误! 可使用§r/function projecte/clearplayeremc §c清零!', '@s');
                        tellas(player, '§c出售物品失败!', '@s');
                        return;
                    } else if (local_price != local_price0) {
                        player.runCommand(`clear @s ${item_id} ${item_data} ${item_amount}`);
                        player.removeTag(`pedata§k-1-${learnedl0}`);
                        learnedl.push(item_id1);
                        learneds = [...new Set(learnedl)];
                        player.addTag(`pedata§k-1-${JSON.stringify(learneds).replaceAll(`"`,`'`)}`);
                        if (local_price < 1000000000) {
                            player.runCommand(`scoreboard players set @s pedata00 ${local_price}`);
                        } else {
                            let local_price_s = String(local_price);
                            while (local_price_s.length < 27) {
                                local_price_s = '0'+local_price_s;
                            }
                            player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                            player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                            player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                        }
                        tellas(player, `出售前EMC: ${temp0} 已出售${item_amount}个${item_id} (EMC=${item_price},data=${item_data}),出售后EMC: ${local_price}`);
                    }
                });
            } else if (r0==1) {
                let templ11 = [];
                for (i in templ1) {
                    templ11.push(`${templ1[i]} emc:${local_price_data[templ1[i]]}`);
                }
                var form1 = new mcui.ModalFormData()
                .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                .dropdown(`请选择要购买的物品id:`,templ11)
                .slider('请拖动选择购买数量',1,64,1,64);
                form1.show(player).then((response1) => {
                    r1 = templ1[response1.formValues[0]];
                    r2 = response1.formValues[1];
                    r0 = 0;
                    temp1 = local_price_data[r1];
                    let datav = r1.includes('[') ? r1.split('[')[1].split(']')[0] : 0;
                    let r1p = r1.includes('[') ? r1.split('[')[0] : r1;
                    if (local_price_data[r1]==undefined) {
                        temp1 = local_price_data[r1p];
                    }
                    temp2 = temp1*r2;
                    if (temp0-temp2>0) {
                        player.runCommand(`give @p ${r1p} ${r2} ${datav}`);
                        let local_price_s = String(temp0-temp2);
                        while (local_price_s.length < 27) {
                            local_price_s = '0'+local_price_s;
                        }
                        player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                        player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                        player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                        tellas(player,`花费${temp2} EMC, 已购买${r2}个${r1}`);
                    } else {
                        let temp3 = Math.floor(temp0/temp1);
                        var form2 = new mcui.ModalFormData()
                        .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                        .slider(`§c目前您有${temp0}EMC,最多购买${temp3}个${r1}(该物品单价:${temp1})\n§r请拖动选择数量`,1,temp3,1,temp3);
                        form2.show(player).then((response2) => {
                            let r22 = response2.formValues[0];
                            let temp22 = temp1*r22;
                            if (temp0-temp22>0) {
                                player.runCommand(`give @p ${r1p} ${r22} ${datav}`);
                                let local_price_s = String(temp0-temp22);
                                while (local_price_s.length < 27) {
                                    local_price_s = '0'+local_price_s;
                                }
                                player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                                player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                                player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                                tellas(player,`花费${temp22} EMC, 已购买${r22}个${r1}`);
                            } else {
                                tellas(player,`§c目前您有${temp0}EMC,最多购买${temp3}个${r1}(该物品单价:${temp1})`);
                            }
                        });
                    }
                });
            } else if (r0==0) {
                if (temp0-temp2>0 && templ1.includes(r1)) {
                    let datav = r1.includes('[') ? r1.split('[')[1].split(']')[0] : 0;
                    let r1p = r1.includes('[') ? r1.split('[')[0] : r1;
                    player.runCommand(`give @p ${r1p} ${r2} ${datav}`);
                    let local_price_s = String(temp0-temp2);
                    while (local_price_s.length < 27) {
                        local_price_s = '0'+local_price_s;
                    }
                    player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                    player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                    player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                    tellas(player,`花费${temp2} EMC, 已购买${r2}个${r[1]}`);
                } else if (temp0-temp2<=0 && templ1.includes(r1)) {
                    let datav = r1.includes('[') ? r1.split('[')[1].split(']')[0] : 0;
                    let r1p = r1.includes('[') ? r1.split('[')[0] : r1;
                    let temp3 = Math.floor(temp0/temp1);
                    var form2 = new mcui.ModalFormData()
                    .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                    .slider(`§c目前您有${temp0}EMC,最多购买${temp3}个${r[1]}(该物品单价:${temp1})\n§r请拖动选择数量`,1,temp3,1,temp3);
                    form2.show(player).then((response2) => {
                        let r22 = response2.formValues[0];
                        let temp22 = temp1*r22;
                        if (temp0-temp22>0) {
                            player.runCommand(`give @p ${r1p} ${r22} ${datav}`);
                            let local_price_s = String(temp0-temp22);
                            while (local_price_s.length < 27) {
                                local_price_s = '0'+local_price_s;
                            }
                            player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                            player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                            player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                            tellas(player,`花费${temp22} EMC, 已购买${r22}个${r[1]}`);
                        } else {
                            tellas(player,`§c目前您有${temp0}EMC,最多购买${temp3}个${r[1]}(该物品单价:${temp1})`);
                        }
                    });
                } else {
                    let templ11 = [];
                    for (i in templ2) {
                        templ11.push(`${templ2[i]} emc:${local_price_data[templ2[i]]}`);
                    }
                    var form3 = new mcui.ModalFormData()
                    .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                    .dropdown(`§c物品不存在于已学习物品列表中或格式不规范, §r搜索${r[1]}的结果为: ${templ2}\n可在以下结果中选择或在下面的文本框中输入:`,templ11)
                    .textField('','')
                    .slider('请拖动选择数量',1,64,1,64);
                    form3.show(player).then((response3) => {
                        let r3 = response3.formValues;
                        let r31 = r3[1]=='' ? templ2[r3[0]] : (r3[1].includes(':') ? r3[1] : 'minecraft:'+r3[1]);
                        let datav = r31.includes('[') ? r31.split('[')[1].split(']')[0] : 0;
                        let r1p = r31.includes('[') ? r31.split('[')[0] : r31;
                        temp1 = local_price_data[r31];
                        if (local_price_data[r31]==undefined) {
                            temp1 = local_price_data[r1p];
                        }
                        
                        temp2 = temp1*r3[2];
                        if (temp0-temp2>0) {
                            player.runCommand(`give @p ${r1p} ${r3[2]} ${datav}`);
                            let local_price_s = String(temp0-temp2);
                            while (local_price_s.length < 27) {
                                local_price_s = '0'+local_price_s;
                            }
                            player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                            player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                            player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                            tellas(player,`花费${temp2} EMC, 已购买${r3[2]}个${r31}`);
                        } else if (temp0-temp2<=0) {
                            let temp3 = Math.floor(temp0/temp1);
                            var form4 = new mcui.ModalFormData()
                            .title(`§l等价交换转化桌§r 测试版 §e§lEMC:§r §l${temp0}`)
                            .slider(`§c目前您有${temp0}EMC,最多购买${temp3}个${r31}(该物品单价:${temp1})\n§r请拖动选择数量`,1,temp3,1,temp3);
                            form4.show(player).then((response4) => {
                                let r22 = response4.formValues[0];
                                let temp22 = temp1*r22;
                                if (temp0-temp22>0) {
                                    player.runCommand(`give @p ${r1p} ${r22} ${datav}`);
                                    let local_price_s = String(temp0-temp22);
                                    while (local_price_s.length < 27) {
                                        local_price_s = '0'+local_price_s;
                                    }
                                    player.runCommand(`scoreboard players set @s pedata00 ${local_price_s.slice(-9)}`);
                                    player.runCommand(`scoreboard players set @s pedata01 ${local_price_s.slice(-18, -9)}`);
                                    player.runCommand(`scoreboard players set @s pedata02 ${local_price_s.slice(-27, -18)}`);
                                    tellas(player,`花费${temp22} EMC, 已购买${r22}个${r31}`);
                                } else {
                                    tellas(player,`§c目前您有${temp0}EMC,最多购买${temp3}个${r31}(该物品单价:${temp1})`);
                                }
                            });
                        } else {
                            tellas(player,`§c输入的内容可能存在错误!`)
                        }
                    });
                }
            }
        });
    } else if (item_id==ph_stone && block_ids in peconfig.ph_stone_trans_0) {
        let issneaking = player.isSneaking;
        let block_iddata = 0;
        for (let i of block_idd) {
            if ((i.name.includes('type')||i.name.includes('color'))&&(block_ids in peconfig.ph_stone_trans_0)) {
                if (block_ids.includes('minecraft:log')||block_ids.includes('minecraft:leaves')) {
                    block_iddata=peconfig.ph_stone_str_to_int_old[i.value];
                } else if (block_ids.includes('minecraft:sapling')||block_ids.includes('minecraft:wool')){
                    block_iddata=peconfig.ph_stone_str_to_int[i.value];
                }
            }
        }
        let block_id = block_iddata>0 ? `${block_ids}[${block_iddata}]` : block_ids;
        let toblock = peconfig.ph_stone_trans_0[block_id];
        if (issneaking) {
            toblock = peconfig.ph_stone_trans_1[block_id];
        }
        let toblocks = toblock?.includes('[') ? toblock.split('[')[0] : toblock;
        let toblockd = toblock?.includes('[') ? toblock.split('[')[1].split(']')[0] : 0;
        let y_mn = y-rangen;
        if (y_mn<-63) {
            y_mn = -63;
        }
        let y_pn = y+rangen;
        if (y_pn>383) {
            y_pn = 383;
        }
        dim.runCommand(`fill ${x-rangen} ${y_mn} ${z-rangen} ${x+rangen} ${y_pn} ${z+rangen} ${toblocks} ${toblockd} replace ${block_ids} ${block_iddata}`);
        player.runCommand(`particle ${'minecraft:basic_smoke_particle'} ~~~`);
        player.runCommand(`particle ${'minecraft:basic_smoke_particle'} ~1~~`);
        player.runCommand(`particle ${'minecraft:basic_smoke_particle'} ~-1~~`);
        player.runCommand(`particle ${'minecraft:basic_smoke_particle'} ~~~1`);
        player.runCommand(`particle ${'minecraft:basic_smoke_particle'} ~~~-1`);
        tellas(player,`[贤者之石]已尝试将附近区域的${block_id}转化为${toblock}!`);
    }
});
