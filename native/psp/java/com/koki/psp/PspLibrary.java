// SPDX-License-Identifier: GPL-2.0-or-later
package com.koki.psp;

import android.content.Context;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;

final class PspLibrary {
    private final Context context;
    private final File root;
    private final AtomicFile index;
    private static final Set<String> extensions = new HashSet<>(Arrays.asList("iso","cso","chd","pbp","elf","prx"));
    PspLibrary(Context context) {
        this.context = context;
        root = new File(context.getFilesDir(), "library/psp");
        index = new AtomicFile(new File(root, "library.json"));
    }
    File root() throws IOException { ensure(root); return root; }
    static void ensure(File directory) throws IOException {
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Could not create PSP storage.");
    }
    synchronized JSONArray read() throws Exception {
        if (!index.getBaseFile().exists()) return new JSONArray();
        try (InputStream in = index.openRead()) { ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] block=new byte[8192];int count;while((count=in.read(block))!=-1)bytes.write(block,0,count);return new JSONArray(bytes.toString("UTF-8")); }
    }
    private void write(JSONArray games) throws Exception {
        root();
        FileOutputStream out = index.startWrite();
        try { out.write(games.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); index.finishWrite(out); }
        catch (Exception error) { index.failWrite(out); throw error; }
    }
    synchronized JSONArray presented() throws Exception {
        JSONArray games = read();
        for (int n=0;n<games.length();n++) {
            JSONObject game=games.getJSONObject(n);
            File screenshot = new File(root(), "screenshots/" + game.getString("id") + ".png");
            if (screenshot.isFile()) game.put("screenshot", Uri.fromFile(screenshot).toString());
        }
        return games;
    }
    synchronized JSONObject game(String id) throws Exception {
        JSONArray games=read();
        for(int n=0;n<games.length();n++) if(games.getJSONObject(n).getString("id").equals(id)) return games.getJSONObject(n);
        throw new IOException("This game is missing from your library.");
    }
    synchronized void played(String id) throws Exception {
        JSONArray games=read();
        for(int n=0;n<games.length();n++) if(games.getJSONObject(n).getString("id").equals(id)) games.getJSONObject(n).put("lastPlayed",System.currentTimeMillis());
        write(games);
    }
    synchronized void favorite(String id) throws Exception {
        JSONArray games=read();
        for(int n=0;n<games.length();n++) {
            JSONObject game=games.getJSONObject(n);
            if(game.getString("id").equals(id)) game.put("favorite",!game.optBoolean("favorite"));
        }
        write(games);
    }
    synchronized void remove(String id) throws Exception {
        JSONArray games=read(), remaining=new JSONArray();
        File folder=null;
        for(int n=0;n<games.length();n++) {
            JSONObject game=games.getJSONObject(n);
            if(game.getString("id").equals(id)) folder=new File(game.getString("folder"));
            else remaining.put(game);
        }
        write(remaining);
        if(folder!=null) {
            boolean used=false;
            for(int n=0;n<remaining.length();n++) if(remaining.getJSONObject(n).optString("folder").equals(folder.getPath())) used=true;
            if(!used) discard(folder);
        }
    }
    private String name(Uri uri) {
        try(Cursor cursor=context.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)) {
            if(cursor!=null && cursor.moveToFirst()) return cursor.getString(0);
        } catch(Exception ignored) {}
        return "PSP game";
    }
    private static String extension(String name) { int dot=name.lastIndexOf('.');return dot<0?"":name.substring(dot+1).toLowerCase(Locale.ROOT); }
    private static String digest(File file) throws Exception {
        MessageDigest sha=MessageDigest.getInstance("SHA-256");
        try(InputStream in=new BufferedInputStream(new FileInputStream(file))) {
            byte[] block=new byte[1024*1024];int count;
            while((count=in.read(block))!=-1) sha.update(block,0,count);
        }
        StringBuilder result=new StringBuilder();
        for(byte value:sha.digest()) result.append(String.format(Locale.ROOT,"%02x",value & 255));
        return result.toString();
    }
    private static String safeName(String name) throws IOException {
        String normalized=name.replace('\\','/');
        if(normalized.startsWith("/") || normalized.matches("^[A-Za-z]:.*")) throw new IOException("The ZIP contains an unsafe file path.");
        String[] parts=normalized.split("/",-1);
        for(String part:parts) if(part.isEmpty() || part.equals(".") || part.equals("..") || part.indexOf(0)>=0) throw new IOException("The ZIP contains an unsafe file path.");
        return normalized;
    }
    private List<File> extract(File zip,File destination) throws Exception {
        List<File> games=new ArrayList<>();
        try(ZipFile archive=new ZipFile(zip)) {
            if(archive.size()>20000) throw new IOException("This ZIP has too many files. Import one game at a time.");
            List<? extends ZipEntry> entries=Collections.list(archive.entries());
            Set<String> names=new HashSet<>(), selected=new HashSet<>(), companions=new HashSet<>();
            for(ZipEntry entry:entries) {
                if(entry.isDirectory()) continue;
                String name=safeName(entry.getName());
                if(!names.add(name.toLowerCase(Locale.ROOT))) throw new IOException("This ZIP contains duplicate file paths.");
                if(extensions.contains(extension(name)) && entry.getSize()!=0) {
                    selected.add(name);
                    if(Arrays.asList("pbp","elf","prx").contains(extension(name))) {
                        int slash=name.lastIndexOf('/'); companions.add(slash<0?"":name.substring(0,slash+1));
                    }
                }
            }
            if(selected.isEmpty()) throw new IOException("No PSP game found. Choose a ZIP containing an ISO, CSO, CHD, PBP, ELF, or PRX.");
            long required=0;
            for(ZipEntry entry:entries) {
                if(entry.isDirectory()) continue;
                String name=safeName(entry.getName());
                if(selected.contains(name) || companions.stream().anyMatch(name::startsWith)) {
                    if(entry.getSize()<0) throw new IOException("This ZIP is incomplete.");
                    required=Math.addExact(required,entry.getSize());
                }
            }
            if(required>destination.getUsableSpace()) throw new IOException("There is not enough storage to import this ZIP.");
            byte[] block=new byte[1024*1024];
            for(ZipEntry entry:entries) {
                if(entry.isDirectory()) continue;
                String name=safeName(entry.getName());
                if(!selected.contains(name) && companions.stream().noneMatch(name::startsWith)) continue;
                File file=new File(destination,name).getCanonicalFile();
                if(!file.getPath().startsWith(destination.getCanonicalPath()+File.separator)) throw new IOException("The ZIP contains an unsafe file path.");
                ensure(file.getParentFile());
                long written=0; CRC32 crc=new CRC32();
                try(InputStream in=archive.getInputStream(entry);OutputStream out=new BufferedOutputStream(new FileOutputStream(file))) {
                    int count;
                    while((count=in.read(block))!=-1) { out.write(block,0,count);crc.update(block,0,count);written+=count; }
                }
                if(written!=entry.getSize() || crc.getValue()!=entry.getCrc()) throw new IOException("This ZIP is damaged or incomplete. Import the working ISO or a complete ZIP.");
                if(selected.contains(name)) games.add(file);
            }
        } catch(ZipException error) { throw new IOException("This ZIP is damaged or incomplete. Import the working ISO or a complete ZIP.",error); }
        return games;
    }
    synchronized void add(Uri uri) throws Exception {
        String name=name(uri), ext=extension(name);
        if(!ext.equals("zip") && !extensions.contains(ext)) throw new IOException("Choose a ZIP, ISO, CSO, CHD, PBP, ELF, or PRX file.");
        File imports=new File(root(),"imports");ensure(imports);
        File folder=new File(imports,UUID.randomUUID().toString());ensure(folder);
        boolean committed=false;
        try {
            File original=new File(folder,"import."+ext);
            try(InputStream in=context.getContentResolver().openInputStream(uri);OutputStream out=new BufferedOutputStream(new FileOutputStream(original))) {
                if(in==null) throw new IOException("Could not read this game file.");
                byte[] block=new byte[1024*1024];int count;
                while((count=in.read(block))!=-1) out.write(block,0,count);
            }
            if(original.length()==0) throw new IOException("This game file is empty.");
            String archiveKey=digest(original);
            JSONArray games=read();
            for(int n=0;n<games.length();n++) if(games.getJSONObject(n).optString("archiveKey").equals(archiveKey)) return;
            File content=new File(folder,"content");ensure(content);
            List<File> imported;
            if(ext.equals("zip")) imported=extract(original,content);
            else {
                File file=new File(content,new File(name).getName());
                Files.move(original.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING);
                imported=Collections.singletonList(file);
            }
            int previous=games.length();
            for(File file:imported) {
                if(file.getName().toLowerCase(Locale.ROOT).endsWith(".prx") && new File(file.getParentFile(),"EBOOT.PBP").isFile()) continue;
                String id=digest(file);
                boolean duplicate=false;
                for(int n=0;n<games.length();n++) if(games.getJSONObject(n).getString("id").equals(id)) duplicate=true;
                if(duplicate) continue;
                String title=file.getName().replaceFirst("\\.[^.]+$","");
                if(title.equalsIgnoreCase("eboot")) title=file.getParentFile().equals(content)?name.replaceFirst("\\.[^.]+$",""):file.getParentFile().getName();
                games.put(new JSONObject().put("id",id).put("title",title).put("file",file.getCanonicalPath()).put("folder",folder.getCanonicalPath())
                    .put("bytes",file.length()).put("favorite",false).put("archiveKey",archiveKey));
            }
            if(games.length()==previous) return;
            Files.deleteIfExists(original.toPath());
            write(games);committed=true;
        } finally { if(!committed) discard(folder); }
    }
    void discard(File folder) throws IOException {
        File target=folder.getCanonicalFile();
        File imports=new File(root(),"imports").getCanonicalFile();
        if(!target.getPath().startsWith(imports.getPath()+File.separator) || !target.getParentFile().equals(imports)) throw new IOException("Invalid import cleanup path.");
        deleteTree(target);
    }
    private static void deleteTree(File file) throws IOException {
        File[] children=file.listFiles();
        if(children!=null) for(File child:children) deleteTree(child);
        Files.deleteIfExists(file.toPath());
    }
}
