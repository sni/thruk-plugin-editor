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
        var edit = editor_open_files[path];
        var editor = ace.edit("editor");
        editor.setSession(edit.session);
        current_open_file = path;
        // show matching action menu
        for(var p in editor_open_files) {
            var id = editor_open_files[p].tabId;
            if(p == path) {
                jQuery('.'+id+"-action").show();
            } else {
                jQuery('.'+id+"-action").hide();
            }
        }
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
});

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
}
function _check_changed_file(filename) {
    var editor = ace.edit("editor");
    var file = editor_open_files[filename];
    // may be undefined during opening a file
    if(file) {
        if(file.origText != editor.getSession().getValue()) {
            if(!file.changed) {
                jQuery("#"+file.tabId+"-tablink SPAN.file-changed").show();
                jQuery("#"+file.tabId+"-tablink").css("font-style", "italic");
            }
            file.changed = true;
            jQuery('#saveicon').removeClass("black_white");
        } else {
            if(file.changed) {
                jQuery("#"+file.tabId+"-tablink SPAN.file-changed").hide();
                jQuery("#"+file.tabId+"-tablink").css("font-style", "");
            }
            file.changed = false;
            jQuery('#saveicon').addClass("black_white");
        }
    }
}

var _resize_editor_and_file_tree = function() {
    var treetable = document.getElementById('treetable');
    var w = treetable.offsetWidth, h = jQuery(window).height() - treetable.offsetTop;
    treetable.style.width  = (w-10) + 'px';
    treetable.style.height = (h-10) + 'px';

    var container = document.getElementById('container');
    container.style.width  = 200 + 'px';
    container.style.height = (h-55)  + 'px';

    var editor = document.getElementById('editor');
    editor.style.height = (h-50)  + 'px';
    var editor = ace.edit("editor");
    editor.resize();
}

window.onresize = _resize_editor_and_file_tree;

var editor_open_files = {};
var current_open_file = "";
var tabCounter = 0;
function _load_file(path, syntax, action_menu) {
    if(editor_open_files[path]) {
        return;
    }
    if(action_menu.length > 0) {
        jQuery('#action_menu_table > tbody:last-child').append("<tr class='nohover menu-loading'><td colspan=2><hr></td></tr><tr class='nohover menu-loading'><td colspan=2><img src='"+url_prefix + 'themes/' +  theme + "/images/loading-icon.gif' width=16 height=16></td></tr");
    }
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
            _load_file_complete(path, syntax, data);
            if(action_menu.length > 0) {
                _load_action_menu(path, action_menu);
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
        }
    });
}

function _load_file_complete(path, syntax, data) {
    // check if that file is already open
    if(editor_open_files[path]) {
        return;
    }
    var mode = "ace/mode/plain_text";
    if(syntax != "") {
        mode = "ace/mode/"+syntax;
    }
    current_open_file = path;
    var session = ace.createEditSession(data.data, mode);
    var editor = ace.edit("editor");
    editor.setSession(session);
    editor.setOptions({
        readOnly: false
    });
    jQuery('#editor').show();
    editor.getSession().setValue(data.data);
    editor.gotoLine(1);
    var id = "tabs-" + tabCounter;
    var filename = path.replace(/^.*\//, '');
    editor_open_files[path] = {
        md5      : data.md5,
        session  : session,
        origText : data.data,
        tabId    : id,
        changed  : false,
        filename : filename
    };

    var tabTemplate = "<li onmouseover='jQuery(\"##{id}-close\").css(\"visibility\", \"visible\")' onmouseout='jQuery(\"##{id}-close\").css(\"visibility\", \"hidden\")'><a href='##{id}' id='#{id}-tablink'>#{label}<span class='file-changed' style='display:none;'>*</span></a> <span id='#{id}-close' class='ui-icon ui-icon-close' role='presentation'>Remove Tab</span></li>";
    var li = jQuery( tabTemplate.replace(/#\{label\}/g, filename).replace(/#\{id\}/g, id));
    var tabs = jQuery("#tabs");
    tabs.find(".ui-tabs-nav").append(li);
    tabs.append("<div id='"+id+"' class='tabpath'>"+path+"</div>");
    tabs.tabs("refresh");
    tabCounter++;
    var openTabs = tabs.find(".ui-tabs-nav")[0].childNodes.length;
    tabs.tabs("option", "active", openTabs-1);
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

            jQuery(data).each(function(i, el) {
                if(el == "-") {
                    jQuery('#action_menu_table > tbody:last-child').append("<tr class='nohover "+edit.tabId+"-action action_menu'><td><hr></td></tr>");
                    return(true);
                }
                var item = document.createElement('tr');
                item.className = "clickable action_menu "+edit.tabId+"-action";
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
                check_server_action(undefined, link, undefined, undefined, undefined, url_prefix + 'cgi-bin/editor.cgi?serveraction=1', {file: path});

                jQuery('.menu-loading').remove();
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
    for(var path in editor_open_files) {
        if(editor_open_files[path].changed) {
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
    var file = editor_open_files[path];
    if(!file.changed) {
        return;
    }

    var editor    = ace.edit("editor");
    var savedText = editor.getSession().getValue();

    var oldSrc = jQuery('#saveicon').attr('src');
    jQuery('#saveicon').attr('src', url_prefix + 'themes/' +  theme + '/images/loading-icon.gif');

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
            jQuery('#saveicon').attr('src', url_prefix + 'themes/' +  theme + '/images/accept.png');
            window.setTimeout(function() {
                jQuery('#saveicon').attr('src', oldSrc);
            }, 1000);
            editor_open_files[path].md5      = data.md5;
            editor_open_files[path].origText = savedText;
            _check_changed_file(path);
        },
        error: function(jqXHR, textStatus, errorThrown) {
            jQuery('#saveicon').attr('src', oldSrc);
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