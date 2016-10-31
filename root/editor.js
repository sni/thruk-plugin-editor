jQuery(function($) {
    // initialize file tree
    jQuery("#tool_set").buttonset();
    jQuery('#tool_collapse').button({
        icons: {primary: 'ui-appsidelist-button'},
        text: false,
        label: 'collapse all folder'
    }).click(function() {
        jQuery('#container').jstree('close_all');
        return;
    });
    jQuery('#tool_expand').button({
        icons: {primary: 'ui-appsidetree-button'},
        text: false,
        label: 'expand all folder'
    }).click(function() {
        jQuery('#container').jstree('open_all');
        return;
    });
    jQuery('#container')
        .jstree({
            plugins: [ "themes", "search" ],
            core:    {
                animation: 0
            },
            themes: {
                theme : 'classic',
                dots  : true
            },
            search: {
                case_insensitive  : true,
                show_only_matches : true
            }
        })
        .on('changed.jstree', function (e, data) {
            // toggle folders on single click
            if(data.node.state.opened) {
                jQuery('#container').jstree('close_node', '#'+data.node.id);
            } else {
                jQuery('#container').jstree('open_node', '#'+data.node.id);
            }
        });

    // initialize open file tabs
    var tabs = jQuery("#tabs").tabs();
    tabs.find(".ui-tabs-nav").sortable({
      axis: "x",
      stop: function() {
        _save_open_tabs();
        tabs.tabs("refresh");
      }
    });
    // close tab handler
    tabs.on("click", "span.ui-icon-close", function() {
      var panelId = jQuery(this).closest("li").attr( "aria-controls" );
      var path = jQuery("#"+panelId).text();
      _close_tab(path);
    });
    // activate tab handler
    tabs.on("tabsactivate", function(event, ui) {
        var path = ui.newPanel.text();
        _activate_session(path);
        _save_open_tabs();
    });

    // initialize editor
    var editor = ace.edit("editor");
    editor.setTheme("ace/theme/clouds");
    editor.setOptions({
        enableLiveAutocompletion: true,
        readOnly: true
    });
    // update changed flag for tabs
    editor.on("change", function(e) {
        _check_changed_file(current_open_file);
    });
    jQuery('#editor').hide();

    _resize_editor_and_file_tree();

    // open previously open tabs
    var saved_tabs = readCookie('thruk_editor_tabs');
    if(saved_tabs) {
        var open = saved_tabs.split(/,/);
        jQuery(open).each(function(i, p) {
            _load_file(p);
        })
    }

    // load file from url
    if(window.location.hash != '#' && window.location.hash != '') {
        var file = window.location.hash.replace(/^#/,'');
        var tmp  = file.split(/:/);
        var line = 1;
        if(tmp.length == 2) {
            file = tmp[0];
            line = tmp[1];
        }
        _load_file(file, line);
        // replace history otherwise we have to press back twice
        var newhash = "#";
        if (history.replaceState) {
            history.replaceState({}, "", newhash);
        } else {
            window.location.replace(newhash);
        }
    }
});

function _activate_session(path) {
    var edit = editor_open_files[path];
    var editor = ace.edit("editor");
    editor.setSession(edit.session);
    current_open_file = path;

    var tabs = jQuery("#tabs").tabs();
    jQuery(jQuery("#tabs").find(".ui-tabs-nav")[0].childNodes).each(function(i, el) {
        var id = jQuery(el).attr('aria-controls');
        if(id == edit.tabId) {
            tabs.tabs("option", "active", i);
            return false;
        }
    });

    // show matching action menu
    for(var key in editor_open_files) {
        var id = editor_open_files[key].tabId;
        if(key == path) {
            jQuery('.'+id+"-action").show();
        } else {
            jQuery('.'+id+"-action").hide();
        }
    }
    _reload_file_if_changed(path);
}

// check current tab every 30 seconds
window.setInterval(function() {
    if(current_open_file) {
        _reload_file_if_changed(current_open_file);
    }
}, 30000);
function _reload_file_if_changed(path) {
    var edit = editor_open_files[path];
    if(!edit) {
        return;
    }

    // dont check more than every few seconds
    var now = Math.round(new Date().getTime()/1000);
    if(edit.lastCheck > now - 10) {
        return;
    }
    edit.lastCheck = now;

    // reload file if its unchanged but changed on server side
    if(!edit.changed) {
        jQuery.ajax({
            url: 'editor.cgi',
            data: {
                action: 'get_file',
                file:   path,
                token:  user_token
            },
            type: 'POST',
            success: function(data) {
                // check if it has been closed meanwhile
                edit = editor_open_files[path];
                if(!edit) {
                    return;
                }
                edit.lastCheck = Math.round(new Date().getTime()/1000);
                if(data.md5 != edit.md5) {
                    edit.md5      = data.md5;
                    edit.origText = data.data;
                    edit.changed  = false;
                    edit.session.setValue(data.data);
                    _check_changed_file(path);
                }
            },
            error: function(jqXHR, textStatus, errorThrown) {
            }
        });
    }
}

function _close_tab(path) {
    if(editor_open_files[path].changed) {
        if(!confirm("Discard unsaved changes?")) {
            return;
        }
    }
    panelId = editor_open_files[path].tabId;
    jQuery('#'+panelId+"-tablink").closest("li").remove();
    delete editor_open_files[path];
    jQuery("#"+panelId).remove();
    var tabs = jQuery("#tabs").tabs();
    tabs.tabs("refresh");
    var openTabs = tabs.find(".ui-tabs-nav")[0].childNodes.length;
    tabs.tabs("option", "active", openTabs-1);
    if(openTabs == 0) {
        var editor = ace.edit("editor");
        editor.setValue("");
        editor.setOptions({
            readOnly: true
        });
        jQuery('#editor').hide();
        current_open_file = "";
    }
    jQuery('.'+panelId+"-action").remove();
    // resize editor, tab bar may have shrinked
    _resize_editor_and_file_tree();
    _save_open_tabs();
}
function _check_changed_file(filename) {
    var edit = editor_open_files[filename];
    // may be undefined during opening a file
    if(edit) {
        if(edit.origText != edit.session.getValue()) {
            jQuery("#"+edit.tabId+"-tablink SPAN.file-changed").show();
            jQuery("#"+edit.tabId+"-tablink").css("font-style", "italic");
            edit.changed = true;
            jQuery('#saveicon').removeClass("black_white");
        } else {
            jQuery("#"+edit.tabId+"-tablink SPAN.file-changed").hide().text("*");
            jQuery("#"+edit.tabId+"-tablink").css("font-style", "");
            edit.changed = false;
            jQuery('#saveicon').addClass("black_white");
        }
    }
}

var _resize_editor_and_file_tree = function() {
    var tabsHeight = jQuery('#tabs').height();
    if(tabsHeight < 32) { tabsHeight = 32; }

    var treetable = document.getElementById('treetable');
    var w = jQuery(window).width(), h = jQuery(window).height() - treetable.offsetTop;
    treetable.style.width  = (w-15) + 'px';
    treetable.style.height = (h-10) + 'px';

    var container = document.getElementById('container');
    container.style.width  = '200px';
    container.style.height = (h - 55)  + 'px';

    var editor = document.getElementById('editor');
    editor.style.height = (h - tabsHeight - 18)  + 'px';
    var editor = ace.edit("editor");
    editor.resize();
}

window.onresize = _resize_editor_and_file_tree;

var editor_open_files = {};
var current_open_file = "";
var tabCounter = 0;
function _load_file(path, line) {
    if(!file_meta_data[path]) {
        return;
    }
    var syntax      = file_meta_data[path].syntax;
    var action_menu = file_meta_data[path].action;

    if(editor_open_files[path]) {
        // switch to that tab
        _activate_session(path);
        return;
    }
    if(action_menu.length > 0) {
        jQuery('#action_menu_table > tbody:last-child').append("<tr class='nohover menu-loading'><td colspan=2><hr></td></tr><tr class='nohover menu-loading'><td colspan=2><img src='"+url_prefix + 'themes/' +  theme + "/images/loading-icon.gif' width=16 height=16></td></tr");
    }

    // check if that file is already open
    if(editor_open_files[path]) {
        return;
    }

    var mode = "ace/mode/plain_text";
    if(syntax != "") {
        mode = "ace/mode/"+syntax;
    }
    current_open_file = path;
    var session = ace.createEditSession("", mode);
    var editor = ace.edit("editor");
    editor.setSession(session);
    jQuery('#editor').show();
    var id = "tabs-" + tabCounter;
    var filename = path.replace(/^.*\//, '');
    editor_open_files[path] = {
        session  : session,
        md5      : "",
        origText : "",
        tabId    : id,
        changed  : false,
        filename : filename,
        lastCheck: Math.round(new Date().getTime()/1000)
    };

    var tabTemplate = "<li onmouseover='jQuery(\"##{id}-close\").css(\"visibility\", \"visible\")' onmouseout='jQuery(\"##{id}-close\").css(\"visibility\", \"hidden\")'><a href='##{id}' id='#{id}-tablink'>#{label}<span class='file-changed'><img style='left: 10px; position: relative;' src='"+url_prefix + 'themes/' +  theme + "/images/loading-icon.gif'></span></a> <span id='#{id}-close' class='ui-icon ui-icon-close' role='presentation'>Remove Tab</span></li>";
    var li = jQuery( tabTemplate.replace(/#\{label\}/g, filename).replace(/#\{id\}/g, id));
    var tabs = jQuery("#tabs");
    tabs.find(".ui-tabs-nav").append(li);
    tabs.append("<div id='"+id+"' class='tabpath'>"+path+"</div>");
    tabs.tabs("refresh");
    tabCounter++;
    // resize editor, tab bar may have grown in height
    _resize_editor_and_file_tree();

    _save_open_tabs();

    jQuery('.action_menu').hide();
    jQuery.ajax({
        url: 'editor.cgi',
        data: {
            action: 'get_file',
            file:   path,
            token:  user_token
        },
        type: 'POST',
        success: function(data) {
            _load_file_complete(path, syntax, data, line);
            if(action_menu.length > 0) {
                _load_action_menu(path, action_menu);
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            jQuery('.menu-loading').remove();
        }
    });
}

function _load_file_complete(path, syntax, data, line) {
    var edit = editor_open_files[path];
    if(!edit) { return; }
    var editor = ace.edit("editor");
    editor.setSession(edit.session);
    edit.md5       = data.md5;
    edit.origText  = data.data;
    edit.changed   = false;
    edit.lastCheck = Math.round(new Date().getTime()/1000);
    editor.getSession().setValue(data.data);
    editor.setOptions({
        readOnly: false
    });
    if(line) {
        editor.gotoLine(Number(line));
    } else {
        editor.gotoLine(1);
    }

    _check_changed_file(path);
    _activate_session(path);
}

function _save_open_tabs() {
    var open = [];
    jQuery(jQuery("#tabs").find(".ui-tabs-nav")[0].childNodes).each(function(i, el) {
        var id = jQuery(el).attr('aria-controls');
        for(var key in editor_open_files) {
            if(editor_open_files[key].tabId == id) {
                open.push(key);
                break;
            }
        }
    });
    cookieSave('thruk_editor_tabs', open.join(','));
}

function _load_action_menu(path, action_menu) {
    jQuery.ajax({
        url: 'editor.cgi',
        data: {
            action:      'get_action_menu',
            action_menu:  action_menu.join(','),
            token:        user_token
        },
        type: 'POST',
        success: function(data) {
            var edit = editor_open_files[path];
            if(!edit) {
                return;
            }

            var display = "none";
            if(path == current_open_file) {
                display = "";
            }
            jQuery('.menu-loading').remove();

            jQuery(data).each(function(i, el) {
                if(el == "-") {
                    jQuery('#action_menu_table > tbody:last-child').append("<tr style='display:"+display+";' class='nohover "+edit.tabId+"-action action_menu'><td><hr></td></tr>");
                    return(true);
                }
                var item = document.createElement('tr');
                item.className = "clickable action_menu "+edit.tabId+"-action";
                item.style.display = display;
                jQuery('#action_menu_table > tbody:last-child').append(item);
                var td = document.createElement('td');
                item.appendChild(td);
                td.className = 'command';

                var link = document.createElement('a');
                if(el.icon) {
                    var span       = document.createElement('span');
                    span.className = 'icon';
                    var img        = document.createElement('img');
                    img.src        = replace_macros(el.icon);
                    img.title      = el.title ? el.title : '';
                    img.width      = 16;
                    img.height     = 16;
                    span.appendChild(img);
                    link.appendChild(span);
                }
                var label = document.createElement('span');
                label.innerHTML = el.label;
                link.appendChild(label);
                link.href       = replace_macros(el.action);

                /* apply other attributes */
                for(var key in el) {
                    if(key != "icon" && key != "action" && key != "label") {
                        link[key] = el[key];
                    }
                }

                td.appendChild(link);
                var extra_data = {
                    file: path,
                    current_data: function() {
                        var editor = ace.edit("editor");
                        return(editor.getSession().getValue());
                    }
                };
                var callback = function(data) {
                    var editor = ace.edit("editor");
                    editor.session.setOption("useWorker", false);
                    // clean current annotations
                    editor.getSession().setAnnotations([]);
                    if(data && data.rc != 0) {
                        // detect perl errors and add annotations
                        var matches = data.msg.match(/(.*) at .*? line (\d+)/);
                        if(matches) {
                            editor.getSession().setAnnotations([{
                              row:    Number(matches[2])-1,
                              column: 0,
                              text:   matches[1],
                              type:  "warning"
                            }]);
                        }
                    }
                }
                check_server_action(undefined, link, undefined, undefined, undefined, url_prefix + 'cgi-bin/editor.cgi?serveraction=1', extra_data, callback);
                return(true);
            });
        },
        error: function(jqXHR, textStatus, errorThrown) {
            jQuery('.menu-loading').remove();
        }
    });
}

jQuery(window).keypress(function(event) {
    if (event.ctrlKey || event.metaKey) {
        switch (String.fromCharCode(event.which).toLowerCase()) {
        case 's':
            _save_current_file();
            event.preventDefault();
            return false;
        case 'w':
            // this seems not to work in most browsers
            // but at least you can use ctrl+w on osx now and meta+w on win/linux
            if(current_open_file) {
                _close_tab(current_open_file);
            }
            event.preventDefault();
            try{event.preventDefault()}catch(ex){}
            return false;
        }
    }
    return true;
});
jQuery(window).on('beforeunload', function(e) {
    var hasUnsaved = false;
    for(var key in editor_open_files) {
        if(editor_open_files[key].changed) {
            hasUnsaved = true;
        }
    }
    if(hasUnsaved) {
        return 'You have unsaved sessions. Are you sure to leave?';
    }
    return "";
});

function _save_current_file() {
    var path = current_open_file;
    if(!path) {
        return;
    }
    if(!editor_open_files[path]) {
        return;
    }
    var edit = editor_open_files[path];
    if(!edit.changed) {
        return;
    }

    var editor    = ace.edit("editor");
    var savedText = editor.getSession().getValue();

    var oldSrc = jQuery('#saveicon').attr('src');
    jQuery('#saveicon').attr('src', url_prefix + 'themes/' +  theme + '/images/loading-icon.gif');

    // fetch current md5 to see if file has changed meanwhile
    jQuery.ajax({
        url: 'editor.cgi',
        data: {
            action: 'get_file',
            file:   path,
            token:  user_token
        },
        type: 'POST',
        success: function(data) {
            if(data.md5 == edit.md5 || confirm("File has changed on server since we opened it. Really overwrite?")) {
                jQuery.ajax({
                    url: 'editor.cgi',
                    data: {
                        action: 'save_file',
                        file:   path,
                        data:   savedText,
                        token:  user_token
                    },
                    type: 'POST',
                    success: function(data) {
                        editor_open_files[path].md5      = data.md5;
                        editor_open_files[path].origText = savedText;
                        _check_changed_file(path);
                        jQuery('#saveicon').attr('src', url_prefix + 'themes/' +  theme + '/images/accept.png').removeClass("black_white");
                        window.setTimeout(function() {
                            jQuery('#saveicon').addClass("black_white");
                            jQuery('#saveicon').attr('src', oldSrc);
                        }, 1000);
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        jQuery('#saveicon').attr('src', oldSrc);
                    }
                });
            } else {
                jQuery('#saveicon').attr('src', oldSrc);
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
        }
    });
}

function _tree_search(value) {
    if(value == "") {
        jQuery('#container').jstree('search', '');
        jQuery('#container').jstree('close_all');
        return;
    }
    jQuery('#container').jstree('open_all');
    jQuery('#container').jstree('search', value);
}